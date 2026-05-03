/**
 * INVOICEFLOW SaaS — Bot Manager v4.0 (Supabase)
 * 
 * Gestor centralizado de múltiples bots de WhatsApp.
 * AHORA: Usa Supabase (PostgreSQL) como base de datos.
 * 
 * Uso:
 *   const botManager = require('./src/bot/botManager');
 *   await botManager.startAllBots();        // Inicia todos los bots activos
 *   await botManager.startBot(empresaId);   // Inicia un bot específico
 *   await botManager.stopBot(empresaId);    // Detiene un bot
 *   const status = botManager.getStatus(1); // Estado de un bot
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ─── BASE DE DATOS SUPABASE ───────────────────────────────────
const { getDb, rowToObj, rowsToArray, PLANTILLAS_BOT, UPLOAD_DIR } = require('../api/database');

// ─── CONFIGURACIÓN ───────────────────────────────────────────
const BOTS_DIR = path.join(__dirname, '..', '..', 'bot-whatsapp', 'sessions');
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;

// Asegurar que existe el directorio de sesiones
if (!fs.existsSync(BOTS_DIR)) {
    fs.mkdirSync(BOTS_DIR, { recursive: true });
}

// ─── MAPA GLOBAL DE SESIONES ─────────────────────────────────
// key: empresa_id (number)
// value: { socket, config, comandosPersonalizados, formulariosActivos, estado, ultimaActividad, intentosReconexion }
const sesiones = new Map();

// ─── FUNCIONES PRIVADAS ──────────────────────────────────────

function getChatPrivadoId(config) {
    if (!config || !config.numero_whatsapp) return null;
    return `${config.numero_whatsapp}@c.us`;
}

async function actualizarEstado(empresaId, nuevoEstado) {
    try {
        const client = getDb();
        await client
            .from('bots_config')
            .update({
                estado: nuevoEstado,
                ultima_conexion: new Date().toISOString()
            })
            .eq('empresa_id', empresaId);
    } catch (error) {
        console.error(`[Bot ${empresaId}] Error al actualizar estado:`, error.message);
    }
}

async function cargarConfiguracion(empresaId) {
    try {
        const client = getDb();
        const { data, error } = await client
            .from('bots_config')
            .select(`
                *,
                empresas!inner(nombre, rubro, color)
            `)
            .eq('empresa_id', empresaId)
            .eq('activo', true)
            .single();

        if (error || !data) {
            console.error(`[Bot ${empresaId}] ❌ Error en consulta:`, error?.message || 'Sin datos');
            if (error) console.error(`[Bot ${empresaId}] 📋 Stack:`, error.stack);
            return null;
        }

        const config = rowToObj(data);

        // Extraer datos de la empresa desde el objeto anidado 'empresas'
        if (config.empresas) {
            config.empresa_nombre = config.empresas.nombre;
            config.rubro = config.empresas.rubro;
            config.color = config.empresas.color;
            delete config.empresas; // Limpiar objeto anidado
        }

        // Agregar comandos según la plantilla
        const plantilla = PLANTILLAS_BOT[config.plantilla] || PLANTILLAS_BOT.general;
        config.comandos = plantilla.comandos;
        config.menu = generarMenuEmpresa(config.empresa_nombre || config.nombre, config.nombre_bot, plantilla);

        return config;
    } catch (error) {
        console.error(`[Bot ${empresaId}] ❌ Error al cargar configuración:`, error.message);
        console.error(`[Bot ${empresaId}] 📋 Stack:`, error.stack);
        return null;
    }
}

async function cargarComandosPersonalizados(empresaId) {
    try {
        const client = getDb();
        const { data, error } = await client
            .from('comandos_personalizados')
            .select('id, comando, descripcion, tipo, config')
            .eq('empresa_id', empresaId)
            .eq('activo', true)
            .order('comando', { ascending: true });

        if (error) throw error;

        const comandos = rowsToArray(data);

        // Parsear config de JSON string a objeto
        for (const cmd of comandos) {
            if (typeof cmd.config === 'string') {
                try {
                    cmd.config = JSON.parse(cmd.config);
                } catch {
                    cmd.config = {};
                }
            }
        }

        return comandos;
    } catch (error) {
        console.error(`[Bot ${empresaId}] ❌ Error al cargar comandos personalizados:`, error.message);
        return [];
    }
}

function generarMenuEmpresa(nombreEmpresa, nombreBot, plantilla) {
    const icono = plantilla.icono;
    const comandos = plantilla.comandos;

    let menu = `${icono} *${nombreBot}*\n`;
    menu += `¡Bienvenido, *${nombreEmpresa}*! 👋\n\n`;
    menu += `*${plantilla.descripcion}*\n\n`;
    menu += '*¿Qué deseas hacer?*\n\n';

    const descripciones = {
        gastos: '📊 Ver mis gastos',
        facturas: '📋 Ver mis facturas',
        presupuesto: '💰 Establecer presupuesto',
        alertas: '⚠️ Ver alertas',
        web: '🌐 Abrir dashboard web',
        foto: '📸 Registrar factura (envía foto)',
        'registrar material': '🧱 Registrar material',
        'registrar obra': '🏗️ Registrar nueva obra',
        'ver obras': '📋 Ver mis obras',
        'gastos de obra': '💰 Gastos por obra',
        'presupuesto obra': '📊 Presupuesto de obra',
        materiales: '📦 Lista de materiales',
        'registrar venta': '🛒 Registrar venta',
        'registrar compra': '📥 Registrar compra',
        inventario: '📦 Ver inventario',
        'gastos del día': '📊 Gastos del día',
        proveedores: '🏢 Mis proveedores',
        'registrar paciente': '👤 Registrar paciente',
        'registrar insumo': '💊 Registrar insumo',
        'citas hoy': '📅 Citas de hoy',
        'gastos médicos': '💰 Gastos médicos',
        'registrar envío': '📦 Registrar envío',
        'rastrear pedido': '🔍 Rastrear pedido',
        'gastos de ruta': '🚛 Gastos de ruta',
        vehículos: '🚗 Vehículos',
    };

    comandos.forEach((cmd, i) => {
        const desc = descripciones[cmd] || `🔹 ${cmd}`;
        menu += `${i + 1}. ${desc}\n`;
    });

    menu += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
    menu += `📸 *Envía una foto* de tu factura para registrar\n`;
    menu += `🔢 *O escribe el número* de la opción deseada`;

    return menu;
}

// ─── PROCESAR COMANDO PERSONALIZADO ──────────────────────────

async function procesarComandoPersonalizado(cmd, msg, sesion) {
    const { config, comandosPersonalizados, formulariosActivos } = sesion;
    
    // Buscar comando exacto (ignorando mayúsculas/minúsculas)
    const comando = comandosPersonalizados.find(c => c.comando.toLowerCase() === cmd);
    if (!comando) return false;
    
    if (comando.tipo === 'simple') {
        const mensaje = comando.config?.mensaje || `✅ *${comando.descripcion || comando.comando}*`;
        await responder(mensaje, sesion);
        return true;
    }
    
    if (comando.tipo === 'formulario') {
        const campos = comando.config?.campos || [];
        if (campos.length === 0) {
            await responder(`❌ El comando *"${comando.comando}"* no tiene campos configurados.`, sesion);
            return true;
        }
        
        const telefono = msg.from;
        formulariosActivos[telefono] = {
            comando: comando.comando,
            comando_id: comando.id,
            paso: 0,
            datos: {},
            campos: campos
        };
        
        const primerCampo = campos[0];
        const etiqueta = typeof primerCampo === 'object' ? (primerCampo.etiqueta || primerCampo.nombre) : primerCampo;
        await responder(`📝 *${comando.descripcion || comando.comando}*\n\nPor favor, responde una por una:\n\n1️⃣ ${etiqueta}:`, sesion);
        return true;
    }
    
    return false;
}

// ─── PROCESAR RESPUESTA DE FORMULARIO ────────────────────────

async function procesarRespuestaFormulario(texto, telefono, sesion) {
    const { formulariosActivos, config } = sesion;
    const formulario = formulariosActivos[telefono];
    if (!formulario) return false;
    
    const { comando, comando_id, paso, datos, campos } = formulario;
    const campoActual = campos[paso];
    const nombreCampo = typeof campoActual === 'object' ? (campoActual.nombre || campoActual.etiqueta || `campo_${paso}`) : campoActual;
    
    if (!texto || texto.trim().length === 0) {
        await responder(`⚠️ El valor no puede estar vacío. Intenta de nuevo:\n\n${paso + 1}️⃣ ${typeof campoActual === 'object' ? (campoActual.etiqueta || campoActual.nombre) : campoActual}:`, sesion);
        return true;
    }
    
    datos[nombreCampo] = texto.trim();
    const siguientePaso = paso + 1;
    
    if (siguientePaso >= campos.length) {
        // Formulario completado
        delete formulariosActivos[telefono];
        
        try {
            const client = getDb();
            await client
                .from('registros_formularios')
                .insert({
                    empresa_id: config.empresa_id || config.id,
                    comando_id: comando_id || null,
                    comando,
                    telefono,
                    datos: JSON.stringify(datos),
                    fecha_registro: new Date().toISOString()
                });
        } catch (error) {
            console.error(`[Bot ${config.empresa_id}] Error al guardar registro:`, error);
        }
        
        const resumen = Object.entries(datos)
            .map(([k, v]) => `• *${k}:* ${v}`)
            .join('\n');
        
        const mensajeFinal = comando.config?.mensaje_final || '✅ *Formulario completado*';
        await responder(`${mensajeFinal}\n\n📋 *Resumen:*\n${resumen}\n\n🔙 *"hola"* para volver al menú`, sesion);
        return true;
    } else {
        formulario.paso = siguientePaso;
        const siguienteCampo = campos[siguientePaso];
        const etiqueta = typeof siguienteCampo === 'object' ? (siguienteCampo.etiqueta || siguienteCampo.nombre) : siguienteCampo;
        await responder(`${siguientePaso + 1}️⃣ ${etiqueta}:`, sesion);
        return true;
    }
}

// ─── RESPONDER ───────────────────────────────────────────────

async function responder(mensaje, sesion) {
    try {
        const { socket, config } = sesion;
        if (!socket) return;
        const chatId = getChatPrivadoId(config);
        if (!chatId) {
            console.log(`[Bot ${config.empresa_id}] ⚠️ No hay número configurado`);
            return;
        }
        await socket.sendMessage(chatId, mensaje);
        console.log(`[Bot ${config.empresa_id}] 📤 Respondió`);
    } catch (error) {
        console.error(`[Bot ${config.empresa_id}] ❌ Error al responder:`, error);
    }
}

// ─── PROCESAR COMANDOS NORMALES ──────────────────────────────

async function procesarComandoNormal(comando, sesion) {
    const { config } = sesion;
    const cmd = comando.toLowerCase().trim();
    
    if (cmd === 'hola' || cmd === 'menu' || cmd === 'ayuda' || cmd === 'start') {
        await responder(config.menu, sesion);
        return;
    }
    
    if (cmd === 'gastos' || cmd === 'mis gastos' || cmd === 'resumen') {
        await procesarGastos(sesion);
        return;
    }
    
    if (cmd === 'facturas' || cmd === 'mis facturas' || cmd === 'ultimas') {
        await procesarFacturas(sesion);
        return;
    }
    
    if (cmd === 'alertas' || cmd === 'alerta') {
        await procesarAlertas(sesion);
        return;
    }
    
    if (cmd === 'web' || cmd === 'dashboard' || cmd === 'sitio') {
        await responder(`🌐 *Dashboard Financiero*\n\nAbre este enlace:\n${SERVER_URL}/empresa/${config.empresa_id}\n\n📊 Ahí puedes ver todos tus datos.`, sesion);
        return;
    }
    
    if (cmd.startsWith('presupuesto ')) {
        await procesarPresupuesto(cmd.replace('presupuesto ', '').trim(), sesion);
        return;
    }
    
    if (cmd === 'presupuesto') {
        await responder('💰 *Presupuesto*\n\nEscribe: *"presupuesto [categoría] [monto]"*\n\nEj: *"presupuesto alimentos 500"*', sesion);
        return;
    }
    
    if (cmd === 'borrar todo' || cmd === 'reset' || cmd === 'limpiar') {
        try {
            const client = getDb();
            await client.from('invoices').delete().eq('empresa_id', config.empresa_id);
            await client.from('budgets').delete().eq('empresa_id', config.empresa_id);
            await responder('🗑️ *Todos los datos han sido eliminados*', sesion);
        } catch {
            await responder('❌ Error al borrar los datos.', sesion);
        }
        return;
    }
    
    await responder(`🤖 No entendí ese comando.\n\nEscribe *"hola"* para ver el menú de opciones.`, sesion);
}

// ─── FUNCIONES DE PROCESAMIENTO ──────────────────────────────

async function procesarGastos(sesion) {
    const { config } = sesion;
    try {
        const client = getDb();
        const empresaId = config.empresa_id || config.id;

        // Total gastado
        const { data: totalData } = await client
            .from('invoices')
            .select('total')
            .eq('empresa_id', empresaId);

        const invoices = rowsToArray(totalData);
        const totalGastadoVal = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
        const totalFacturasVal = invoices.length;

        // Categorías
        const { data: categoriasData } = await client
            .from('invoices')
            .select('categoria, total')
            .eq('empresa_id', empresaId);

        const categoriasArr = rowsToArray(categoriasData);
        const categoriasMap = {};
        for (const inv of categoriasArr) {
            const cat = inv.categoria || 'Sin categoría';
            if (!categoriasMap[cat]) categoriasMap[cat] = { total: 0, count: 0 };
            categoriasMap[cat].total += inv.total || 0;
            categoriasMap[cat].count += 1;
        }

        const categorias = Object.entries(categoriasMap)
            .map(([categoria, data]) => ({ categoria, total: data.total, count: data.count }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);

        let categoriasStr = '';
        if (categorias.length > 0) {
            categoriasStr = categorias.map(c => 
                `• ${c.categoria}: $${c.total.toFixed(2)} (${c.count} facturas)`
            ).join('\n');
        } else {
            categoriasStr = '• Aún no hay gastos registrados';
        }

        const promedio = totalFacturasVal > 0 ? totalGastadoVal / totalFacturasVal : 0;

        const respuesta = `📊 *Resumen Financiero*\n\n` +
            `💰 *Total gastado:* $${totalGastadoVal.toFixed(2)}\n` +
            `📄 *Facturas:* ${totalFacturasVal}\n` +
            `📈 *Promedio:* $${promedio.toFixed(2)}\n\n` +
            `*Por categoría:*\n${categoriasStr}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `📸 *Envía una foto* de tu factura para registrar\n` +
            `🔙 *"hola"* para volver al menú`;
        
        await responder(respuesta, sesion);
    } catch (error) {
        await responder('❌ Error al consultar tus gastos.', sesion);
    }
}

async function procesarFacturas(sesion) {
    const { config } = sesion;
    try {
        const client = getDb();
        const empresaId = config.empresa_id || config.id;

        const { data, error } = await client
            .from('invoices')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('fecha_registro', { ascending: false })
            .limit(5);

        if (error) throw error;

        const facturas = rowsToArray(data);

        if (!facturas || facturas.length === 0) {
            await responder('📋 *No tienes facturas registradas aún*\n\nEnvía una foto de tu factura para empezar.', sesion);
            return;
        }

        let lista = facturas.map((f, i) => 
            `${i+1}. *${f.proveedor}* - $${f.total.toFixed(2)}\n   📅 ${f.fecha} | ${f.categoria}`
        ).join('\n\n');

        const respuesta = `📋 *Últimas ${facturas.length} facturas:*\n\n${lista}\n\n━━━━━━━━━━━━━━━━━━━━━\n📊 *"gastos"* para ver resumen\n🔙 *"hola"* para volver al menú`;
        await responder(respuesta, sesion);
    } catch (error) {
        await responder('❌ Error al consultar facturas.', sesion);
    }
}

async function procesarPresupuesto(texto, sesion) {
    const { config } = sesion;
    const partes = texto.split(' ');
    if (partes.length >= 2) {
        const categoria = partes.slice(0, -1).join(' ');
        const monto = parseFloat(partes[partes.length - 1]);

        if (!isNaN(monto) && monto > 0) {
            try {
                const client = getDb();
                const empresaId = config.empresa_id || config.id;
                const mes = new Date().toISOString().substring(0, 7);

                // UPSERT
                const { data: existing } = await client
                    .from('budgets')
                    .select('id')
                    .eq('empresa_id', empresaId)
                    .eq('categoria', categoria)
                    .eq('mes', mes)
                    .maybeSingle();

                if (existing) {
                    await client
                        .from('budgets')
                        .update({ limite: monto })
                        .eq('id', existing.id);
                } else {
                    await client
                        .from('budgets')
                        .insert({
                            empresa_id: empresaId,
                            categoria,
                            limite: monto,
                            mes
                        });
                }

                await responder(`💰 *Presupuesto actualizado*\n\n${categoria}: $${monto.toFixed(2)}/mes\n\n🔙 *"hola"* para volver al menú`, sesion);
            } catch {
                await responder('❌ Error al establecer presupuesto.', sesion);
            }
            return;
        }
    }
    await responder('❌ Formato: *"presupuesto [categoría] [monto]"*\n\nEj: *"presupuesto alimentos 500"*', sesion);
}

async function procesarAlertas(sesion) {
    const { config } = sesion;
    try {
        const client = getDb();
        const empresaId = config.empresa_id || config.id;

        // Obtener presupuestos
        const { data: budgets } = await client
            .from('budgets')
            .select('*')
            .eq('empresa_id', empresaId);

        // Obtener facturas
        const { data: invoices } = await client
            .from('invoices')
            .select('total, categoria, fecha')
            .eq('empresa_id', empresaId);

        const budgetsArr = rowsToArray(budgets);
        const invoicesArr = rowsToArray(invoices);

        const alerts = [];
        for (const b of budgetsArr) {
            const gastado = invoicesArr
                .filter(i => i.categoria === b.categoria && i.fecha && i.fecha.substring(0, 7) === b.mes)
                .reduce((sum, i) => sum + (i.total || 0), 0);

            if (gastado > b.limite * 0.8) {
                alerts.push({
                    categoria: b.categoria,
                    limite: b.limite,
                    gastado: Math.round(gastado * 100) / 100
                });
            }
        }

        let respuesta;
        if (!alerts || alerts.length === 0) {
            respuesta = '✅ *No hay alertas*\n\nTus presupuestos están en orden.';
        } else {
            let lista = alerts.map(a => 
                `⚠️ *${a.categoria}*: $${a.gastado.toFixed(2)} de $${a.limite.toFixed(2)}`
            ).join('\n');
            respuesta = `🚨 *Alertas de Presupuesto*\n\n${lista}\n\n💰 Usa *"presupuesto [cat] [monto]"* para ajustar\n🔙 *"hola"* para volver al menú`;
        }

        await responder(respuesta, sesion);
    } catch {
        await responder('❌ Error al consultar alertas.', sesion);
    }
}

// ─── PROCESAR IMAGEN DE FACTURA ──────────────────────────────

async function procesarImagenFactura(media, sesion) {
    const { config } = sesion;

    if (media.mimetype && media.mimetype.startsWith('image/')) {
        await responder('📸 *Procesando factura...*\n\n⏳ Un momento por favor...', sesion);

        try {
            const contenido = Buffer.from(media.data, 'base64');
            const resultado = await procesarYGuardarFactura(contenido, config.empresa_id || config.id);

            let respuesta;
            if (resultado.status === 'ok') {
                respuesta = `✅ *Factura registrada*\n\n` +
                    `🏢 *${resultado.datos.proveedor}*\n` +
                    `💰 *Total:* $${resultado.datos.total.toFixed(2)}\n` +
                    `📂 *Categoría:* ${resultado.datos.categoria}\n` +
                    `📅 *Fecha:* ${resultado.datos.fecha}\n\n`;

                if (resultado.analisis && resultado.analisis.insights && resultado.analisis.insights.length > 0) {
                    respuesta += `🔍 *Insights:*\n`;
                    resultado.analisis.insights.forEach(i => {
                        respuesta += `${i}\n`;
                    });
                    respuesta += '\n';
                }

                respuesta += `📊 *"gastos"* para ver resumen`;
            } else if (resultado.status === 'duplicado') {
                respuesta = '⚠️ *Factura duplicada*\n\nEsta factura ya fue registrada anteriormente.';
            } else {
                respuesta = '❌ Error al procesar la factura.';
            }

            await responder(respuesta, sesion);
        } catch (error) {
            console.error(`[Bot ${config.empresa_id}] Error al procesar factura:`, error);
            await responder('❌ Error al procesar la factura. Asegúrate de que la imagen sea clara.', sesion);
        }
    }
}

// ─── PROCESAR FACTURA (LOCAL) ────────────────────────────────

function calcularHash(contenido) {
    return crypto.createHash('md5').update(contenido).digest('hex');
}

function extraerFacturaSimulada(filename) {
    const proveedores = [
        "Distribuidora Los Andes", "Farmacia San José", "Comercial El Sol",
        "Inversiones 2000", "Distribuidora Polar", "Mercado Municipal",
        "Ferremateriales El Constructor", "Clínica Dental Care"
    ];
    const categorias = [
        "Alimentos", "Salud", "Oficina", "Servicios", "Transporte", "Tecnología",
        "Materiales Construcción", "Insumos Médicos"
    ];

    return {
        proveedor: proveedores[Math.floor(Math.random() * proveedores.length)],
        fecha: new Date().toISOString().split('T')[0],
        total: Math.round((Math.random() * 490 + 10) * 100) / 100,
        categoria: categorias[Math.floor(Math.random() * categorias.length)],
        numero_factura: `F-${Math.floor(Math.random() * 9000) + 1000}`,
        tipo_gasto: Math.random() > 0.5 ? 'fijo' : 'variable'
    };
}

async function analizarGasto(datos, empresaId) {
    const client = getDb();
    const mesActual = new Date().toISOString().substring(0, 7);

    const { data: invoicesMes } = await client
        .from('invoices')
        .select('id, total')
        .eq('empresa_id', empresaId)
        .gte('fecha', `${mesActual}-01`)
        .lte('fecha', `${mesActual}-31`);

    const invoicesArr = rowsToArray(invoicesMes);
    const totalMes = invoicesArr.reduce((sum, inv) => sum + (inv.total || 0), 0);

    const { data: previos } = await client
        .from('invoices')
        .select('id')
        .eq('empresa_id', empresaId)
        .eq('proveedor', datos.proveedor);

    const gastosPrevios = rowsToArray(previos).length;

    const { data: duplicados } = await client
        .from('invoices')
        .select('id')
        .eq('empresa_id', empresaId)
        .eq('total', datos.total)
        .eq('proveedor', datos.proveedor);

    const duplicadosCount = rowsToArray(duplicados).length;

    const insights = [];
    if (duplicadosCount > 1) {
        insights.push("⚠️ Posible gasto duplicado con este proveedor");
    }
    if (gastosPrevios > 2) {
        insights.push(`📊 Gastas seguido en ${datos.proveedor} (${gastosPrevios} veces)`);
    }
    if (datos.total > 200) {
        insights.push("💰 Gasto alto detectado");
    }

    return {
        gastos_mes: invoicesArr.length,
        total_mes: Math.round(totalMes * 100) / 100,
        insights
    };
}

async function procesarYGuardarFactura(contenido, empresaId) {
    const hashImg = calcularHash(contenido);

    const filename = `${hashImg}.jpg`;
    const filepath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(filepath, contenido);

    const datos = extraerFacturaSimulada(filename);

    const client = getDb();
    try {
        const { error } = await client
            .from('invoices')
            .insert({
                empresa_id: empresaId,
                proveedor: datos.proveedor,
                fecha: datos.fecha,
                total: datos.total,
                categoria: datos.categoria,
                numero_factura: datos.numero_factura,
                tipo_gasto: datos.tipo_gasto,
                fecha_registro: new Date().toISOString(),
                hash_imagen: hashImg
            });

        if (error) throw error;

        const analisis = await analizarGasto(datos, empresaId);

        return {
            status: "ok",
            mensaje: `✅ Factura de ${datos.proveedor} registrada`,
            datos,
            analisis
        };
    } catch (err) {
        if (err.message && err.message.includes('duplicate') || err.code === '23505') {
            return {
                status: "duplicado",
                mensaje: "⚠️ Esta factura ya fue registrada anteriormente"
            };
        }
        throw err;
    }
}

// ─── CREAR SESIÓN PARA UNA EMPRESA ───────────────────────────

async function startBot(empresaId) {
    // Si ya existe una sesión, no crear duplicado
    if (sesiones.has(empresaId)) {
        const existente = sesiones.get(empresaId);
        if (existente.socket && existente.estado === 'conectado') {
            console.log(`[Bot ${empresaId}] ⚠️ Ya hay una sesión activa`);
            return existente;
        }
        // Si existe pero está desconectada, limpiar
        await stopBot(empresaId);
    }

    console.log(`\n═══════════════════════════════════════════`);
    console.log(`  🚀 INICIANDO BOT — Empresa #${empresaId}`);
    console.log(`═══════════════════════════════════════════\n`);

    // Cargar configuración
    const config = await cargarConfiguracion(empresaId);
    if (!config) {
        console.error(`[Bot ${empresaId}] ❌ No se pudo cargar la configuración`);
        return null;
    }

    // Cargar comandos personalizados
    const comandosPersonalizados = await cargarComandosPersonalizados(empresaId);
    console.log(`[Bot ${empresaId}] ✅ ${comandosPersonalizados.length} comandos personalizados cargados`);

    // Crear objeto de sesión
    const sesion = {
        socket: null,
        config,
        comandosPersonalizados,
        formulariosActivos: {},
        estado: 'conectando',
        ultimaActividad: new Date().toISOString(),
        intentosReconexion: 0,
        maxReintentos: 5,
        qrGenerado: null,
        callbacks: {}
    };

    sesiones.set(empresaId, sesion);

    // Actualizar estado en BD
    await actualizarEstado(empresaId, 'conectando');

    // Crear cliente de WhatsApp
    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: `empresa-${empresaId}`,
            dataPath: BOTS_DIR
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--disable-dev-shm-usage'
            ]
        }
    });

    sesion.socket = client;

    // ─── EVENTOS ─────────────────────────────────────────────

    client.on('qr', async (qr) => {
        sesion.qrGenerado = qr;
        sesion.estado = 'esperando_escaneo';
        console.log(`[Bot ${empresaId}] 📱 QR generado — Escanea con WhatsApp`);

        try {
            const qrcodeTerminal = require('qrcode-terminal');
            qrcodeTerminal.generate(qr, { small: true });
        } catch {
            console.log(`[Bot ${empresaId}] QR: http://localhost:3000/api/bots/${empresaId}/qr`);
        }
    });

    client.on('ready', async () => {
        sesion.estado = 'conectado';
        sesion.qrGenerado = null;
        sesion.intentosReconexion = 0;
        sesion.ultimaActividad = new Date().toISOString();

        await actualizarEstado(empresaId, 'conectado');

        console.log(`\n═══════════════════════════════════════════`);
        console.log(`  ✅ BOT CONECTADO — Empresa #${empresaId}`);
        console.log(`  🤖 ${config.nombre_bot}`);
        console.log(`  🏢 ${config.empresa_nombre}`);
        console.log(`  🏗️  Rubro: ${config.rubro}`);
        console.log(`  📱 Número: ${config.numero_whatsapp || 'No configurado'}`);
        console.log(`═══════════════════════════════════════════\n`);

        // Enviar mensaje de bienvenida
        await responder(config.menu, sesion);
    });

    client.on('authenticated', () => {
        console.log(`[Bot ${empresaId}] ✅ Autenticado`);
        sesion.ultimaActividad = new Date().toISOString();
    });

    client.on('auth_failure', (msg) => {
        sesion.estado = 'error';
        console.error(`[Bot ${empresaId}] ❌ Error de autenticación:`, msg);
    });

    client.on('disconnected', async (reason) => {
        sesion.estado = 'desconectado';
        sesion.ultimaActividad = new Date().toISOString();
        await actualizarEstado(empresaId, 'desconectado');

        console.log(`[Bot ${empresaId}] ❌ Desconectado:`, reason);

        // Intentar reconexión con backoff
        sesion.intentosReconexion++;

        if (sesion.intentosReconexion <= sesion.maxReintentos) {
            const backoff = Math.min(5000 * Math.pow(2, sesion.intentosReconexion - 1), 60000);
            console.log(`[Bot ${empresaId}] 🔄 Reintento ${sesion.intentosReconexion}/${sesion.maxReintentos} en ${backoff / 1000}s...`);

            setTimeout(async () => {
                try {
                    await startBot(empresaId);
                } catch (err) {
                    console.error(`[Bot ${empresaId}] Error en reconexión:`, err);
                }
            }, backoff);
        } else {
            console.error(`[Bot ${empresaId}] ❌ Se agotaron los reintentos. Marcando como inactivo.`);
            sesion.estado = 'inactivo';
            await actualizarEstado(empresaId, 'inactivo');
            sesiones.delete(empresaId);
        }
    });

    // ─── EVENTO: MENSAJE RECIBIDO ────────────────────────────────

    client.on('message_create', async (msg) => {
        sesion.ultimaActividad = new Date().toISOString();

        // Anti-loop: ignorar mensajes del propio bot
        if (msg.fromMe) return;

        const texto = msg.body?.trim().toLowerCase() || '';
        const telefono = msg.from;

        // ─── PROCESAR FORMULARIOS ACTIVOS ──────────────────────
        if (sesion.formulariosActivos[telefono]) {
            await procesarRespuestaFormulario(texto, telefono, sesion);
            return;
        }

        // ─── PROCESAR IMÁGENES ─────────────────────────────────
        if (msg.hasMedia) {
            const media = await msg.downloadMedia();
            if (media) {
                await procesarImagenFactura(media, sesion);
                return;
            }
        }

        // ─── PROCESAR COMANDOS PERSONALIZADOS ──────────────────
        if (await procesarComandoPersonalizado(texto, msg, sesion)) {
            return;
        }

        // ─── PROCESAR COMANDOS NORMALES ────────────────────────
        await procesarComandoNormal(texto, sesion);
    });

    // Inicializar cliente
    try {
        await client.initialize();
        console.log(`[Bot ${empresaId}] 🔄 Inicializando...`);
    } catch (error) {
        console.error(`[Bot ${empresaId}] ❌ Error al inicializar:`, error.message);
        sesion.estado = 'error';
        await actualizarEstado(empresaId, 'error');
        sesiones.delete(empresaId);
        return null;
    }

    return sesion;
}

// ─── DETENER BOT ─────────────────────────────────────────────

async function stopBot(empresaId) {
    const sesion = sesiones.get(empresaId);
    if (!sesion) {
        console.log(`[Bot ${empresaId}] ⚠️ No hay sesión activa para detener`);
        return;
    }

    console.log(`\n═══════════════════════════════════════════`);
    console.log(`  ⏹️  DETENIENDO BOT — Empresa #${empresaId}`);
    console.log(`═══════════════════════════════════════════\n`);

    try {
        if (sesion.socket) {
            await sesion.socket.destroy();
            console.log(`[Bot ${empresaId}] ✅ Cliente destruido`);
        }
    } catch (error) {
        console.error(`[Bot ${empresaId}] Error al destruir cliente:`, error.message);
    }

    sesion.estado = 'detenido';
    sesion.socket = null;
    sesion.qrGenerado = null;
    sesion.formulariosActivos = {};

    await actualizarEstado(empresaId, 'desconectado');
    sesiones.delete(empresaId);

    console.log(`[Bot ${empresaId}] ✅ Bot detenido correctamente\n`);
}

// ─── OBTENER ESTADO DE UN BOT ────────────────────────────────

function getStatus(empresaId) {
    const sesion = sesiones.get(empresaId);
    if (!sesion) {
        return {
            empresa_id: empresaId,
            estado: 'inactivo',
            qr: null,
            ultima_actividad: null,
            formularios_activos: 0,
            empresa: null
        };
    }

    return {
        empresa_id: empresaId,
        estado: sesion.estado,
        qr: sesion.qrGenerado,
        ultima_actividad: sesion.ultimaActividad,
        formularios_activos: Object.keys(sesion.formulariosActivos).length,
        empresa: sesion.config ? {
            nombre: sesion.config.empresa_nombre,
            nombre_bot: sesion.config.nombre_bot,
            rubro: sesion.config.rubro,
            color: sesion.config.color
        } : null
    };
}

// ─── LISTAR ESTADO DE TODOS LOS BOTS ─────────────────────────

function listAllStatus() {
    const estados = {};
    for (const [empresaId, sesion] of sesiones) {
        estados[empresaId] = getStatus(empresaId);
    }
    return estados;
}

// ─── INICIAR TODOS LOS BOTS ACTIVOS ──────────────────────────

async function startAllBots() {
    console.log(`\n═══════════════════════════════════════════`);
    console.log(`  🚀 INICIANDO TODOS LOS BOTS ACTIVOS`);
    console.log(`═══════════════════════════════════════════\n`);

    try {
        const client = getDb();
        const { data, error } = await client
            .from('bots_config')
            .select('empresa_id')
            .eq('activo', true);

        if (error) throw error;

        const botsActivos = rowsToArray(data);

        if (!botsActivos || botsActivos.length === 0) {
            console.log(`\n📭 No hay bots activos configurados\n`);
            return;
        }

        console.log(`📋 ${botsActivos.length} bots activos encontrados\n`);

        const resultados = await Promise.allSettled(
            botsActivos.map(bot => startBot(bot.empresa_id))
        );

        const exitosos = resultados.filter(r => r.status === 'fulfilled' && r.value !== null).length;
        const fallidos = resultados.filter(r => r.status === 'rejected' || r.value === null).length;

        console.log(`\n═══════════════════════════════════════════`);
        console.log(`  📊 RESULTADOS:`);
        console.log(`  ✅ ${exitosos} bots iniciados`);
        console.log(`  ❌ ${fallidos} bots fallaron`);
        console.log(`═══════════════════════════════════════════\n`);
    } catch (error) {
        console.error(`❌ Error al iniciar bots:`, error.message);
    }
}

// ─── EXPORTAR ────────────────────────────────────────────────

module.exports = {
    startBot,
    stopBot,
    getStatus,
    listAllStatus,
    startAllBots,
    sesiones
};
