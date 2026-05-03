/**
 * INVOICEFLOW SaaS — Bot Multi-Empresa v3.0
 * 
 * Un solo bot que se adapta a cada empresa según su configuración.
 * Cada empresa tiene su propio número de WhatsApp y plantilla personalizada.
 * 
 * CÓMO USAR:
 * 1. Configura la empresa en el panel admin (http://localhost:8000/admin)
 * 2. Obtén el ID de la empresa
 * 3. Ejecuta: node bot-multi-empresa.js --empresa=1
 * 4. Escanea QR en http://localhost:3000
 * 5. El bot se adaptará automáticamente a la empresa
 */

const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const https = require('https');
const path = require('path');
const fs = require('fs');

// ─── CONFIGURACIÓN ───────────────────────────────────────────
const API_URL = process.env.API_URL || 'http://localhost:8000';
const PORT = process.env.PORT || 3000;

// Obtener empresa_id de argumentos o variable de entorno
const args = process.argv.slice(2);
let EMPRESA_ID = null;
for (const arg of args) {
    if (arg.startsWith('--empresa=')) {
        EMPRESA_ID = parseInt(arg.split('=')[1]);
    }
}
EMPRESA_ID = EMPRESA_ID || parseInt(process.env.EMPRESA_ID) || null;

if (!EMPRESA_ID) {
    console.error('❌ Debes especificar el ID de la empresa');
    console.error('   node bot-multi-empresa.js --empresa=1');
    console.error('   o: set EMPRESA_ID=1 && node bot-multi-empresa.js');
    process.exit(1);
}

// ─── VARIABLES GLOBALES ──────────────────────────────────────
let config = null;
let qrGenerado = null;
let estado = 'conectando';
let client = null;

// ─── COMANDOS PERSONALIZADOS ─────────────────────────────────
let comandosPersonalizados = [];       // Lista de comandos personalizados activos
let formulariosActivos = {};           // Estado de formularios en curso: { telefono: { comando, comando_id, paso, datos, campos } }

// ─── SERVIDOR EXPRESS ────────────────────────────────────────
const app = express();
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);

// ─── FUNCIONES AUXILIARES ────────────────────────────────────

function hacerPeticion(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const data = options.body ? JSON.stringify(options.body) : null;
        
        const protocol = urlObj.protocol === 'https:' ? https : require('http');
        
        const req = protocol.request({
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            port: urlObj.port,
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch { resolve(body); }
            });
        });
        
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

async function cargarConfiguracion() {
    try {
        config = await hacerPeticion(`${API_URL}/api/bot/${EMPRESA_ID}/config`);
        console.log(`✅ Configuración cargada para: ${config.empresa_nombre}`);
        console.log(`   Bot: ${config.nombre_bot}`);
        console.log(`   Rubro: ${config.rubro}`);
        console.log(`   Comandos: ${config.comandos.join(', ')}`);
        return true;
    } catch (error) {
        console.error('❌ Error al cargar configuración:', error.message);
        return false;
    }
}

async function actualizarEstado(nuevoEstado) {
    try {
        await hacerPeticion(`${API_URL}/api/bot/${EMPRESA_ID}/status`, {
            method: 'POST',
            body: { estado: nuevoEstado }
        });
    } catch (error) {
        console.error('Error al actualizar estado:', error.message);
    }
}

function getChatPrivadoId() {
    if (!config || !config.numero_whatsapp) return null;
    return `${config.numero_whatsapp}@c.us`;
}

// ─── CARGAR COMANDOS PERSONALIZADOS ──────────────────────────
async function cargarComandosPersonalizados() {
    try {
        comandosPersonalizados = await hacerPeticion(`${API_URL}/api/bot/${EMPRESA_ID}/comandos-personalizados`);
        console.log(`✅ ${comandosPersonalizados.length} comandos personalizados cargados`);
        return true;
    } catch (error) {
        console.error('❌ Error al cargar comandos personalizados:', error.message);
        comandosPersonalizados = [];
        return false;
    }
}

// ─── PROCESAR COMANDO PERSONALIZADO ──────────────────────────
async function procesarComandoPersonalizado(cmd, msg) {
    // Buscar comando exacto (ignorando mayúsculas/minúsculas)
    const comando = comandosPersonalizados.find(c => c.comando.toLowerCase() === cmd);
    if (!comando) return false; // No es un comando personalizado
    
    if (comando.tipo === 'simple') {
        // Tipo simple: responder con mensaje fijo
        const mensaje = comando.config?.mensaje || `✅ *${comando.descripcion || comando.comando}*`;
        await responder(mensaje);
        return true;
    }
    
    if (comando.tipo === 'formulario') {
        // Tipo formulario: iniciar conversación guiada
        const campos = comando.config?.campos || [];
        if (campos.length === 0) {
            await responder(`❌ El comando *"${comando.comando}"* no tiene campos configurados.`);
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
        
        // Preguntar el primer campo
        const primerCampo = campos[0];
        const etiqueta = typeof primerCampo === 'object' ? (primerCampo.etiqueta || primerCampo.nombre) : primerCampo;
        await responder(`📝 *${comando.descripcion || comando.comando}*\n\nPor favor, responde una por una:\n\n1️⃣ ${etiqueta}:`);
        return true;
    }
    
    return false;
}

// ─── PROCESAR RESPUESTA DE FORMULARIO ────────────────────────
async function procesarRespuestaFormulario(texto, telefono) {
    const formulario = formulariosActivos[telefono];
    if (!formulario) return false;
    
    const { comando, comando_id, paso, datos, campos } = formulario;
    const campoActual = campos[paso];
    const nombreCampo = typeof campoActual === 'object' ? (campoActual.nombre || campoActual.etiqueta || `campo_${paso}`) : campoActual;
    
    // Validar que no esté vacío
    if (!texto || texto.trim().length === 0) {
        await responder(`⚠️ El valor no puede estar vacío. Intenta de nuevo:\n\n${paso + 1}️⃣ ${typeof campoActual === 'object' ? (campoActual.etiqueta || campoActual.nombre) : campoActual}:`);
        return true;
    }
    
    // Guardar el valor
    datos[nombreCampo] = texto.trim();
    
    // Avanzar al siguiente campo
    const siguientePaso = paso + 1;
    
    if (siguientePaso >= campos.length) {
        // Formulario completado
        delete formulariosActivos[telefono];
        
        // Guardar en la API
        try {
            await hacerPeticion(`${API_URL}/api/empresas/${EMPRESA_ID}/registros-formularios`, {
                method: 'POST',
                body: {
                    comando: comando,
                    comando_id: comando_id,
                    telefono: telefono,
                    datos: datos
                }
            });
        } catch (error) {
            console.error('Error al guardar registro de formulario:', error);
        }
        
        // Mostrar resumen
        const resumen = Object.entries(datos)
            .map(([k, v]) => `• *${k}:* ${v}`)
            .join('\n');
        
        const mensajeFinal = comando.config?.mensaje_final || '✅ *Formulario completado*';
        await responder(`${mensajeFinal}\n\n📋 *Resumen:*\n${resumen}\n\n🔙 *"hola"* para volver al menú`);
        return true;
    } else {
        // Preguntar siguiente campo
        formulario.paso = siguientePaso;
        const siguienteCampo = campos[siguientePaso];
        const etiqueta = typeof siguienteCampo === 'object' ? (siguienteCampo.etiqueta || siguienteCampo.nombre) : siguienteCampo;
        await responder(`${siguientePaso + 1}️⃣ ${etiqueta}:`);
        return true;
    }
}

// ─── FUNCIÓN PARA RESPONDER ──────────────────────────────────
async function responder(mensaje) {
    try {
        if (!client) return;
        const chatId = getChatPrivadoId();
        if (!chatId) {
            console.log('⚠️ No hay número de WhatsApp configurado para esta empresa');
            return;
        }
        await client.sendMessage(chatId, mensaje);
        console.log(`📤 Bot respondió a ${config.empresa_nombre}`);
    } catch (error) {
        console.error('❌ Error al responder:', error);
    }
}

// ─── PROCESAR COMANDOS SEGÚN PLANTILLA ───────────────────────

async function procesarComando(comando, msg) {
    const cmd = comando.toLowerCase().trim();
    
    // Comandos universales (funcionan en todas las plantillas)
    if (cmd === 'hola' || cmd === 'menu' || cmd === 'ayuda' || cmd === 'start') {
        await responder(config.menu);
        return;
    }
    
    if (cmd === 'gastos' || cmd === 'mis gastos' || cmd === 'resumen') {
        await procesarGastos();
        return;
    }
    
    if (cmd === 'facturas' || cmd === 'mis facturas' || cmd === 'ultimas') {
        await procesarFacturas();
        return;
    }
    
    if (cmd === 'alertas' || cmd === 'alerta') {
        await procesarAlertas();
        return;
    }
    
    if (cmd === 'web' || cmd === 'dashboard' || cmd === 'sitio') {
        await responder(`🌐 *Dashboard Financiero*\n\nAbre este enlace:\n${API_URL}/empresa/${EMPRESA_ID}\n\n📊 Ahí puedes ver todos tus datos.`);
        return;
    }
    
    if (cmd.startsWith('presupuesto ')) {
        await procesarPresupuesto(cmd.replace('presupuesto ', '').trim());
        return;
    }
    
    if (cmd === 'presupuesto') {
        await responder('💰 *Presupuesto*\n\nEscribe: *"presupuesto [categoría] [monto]"*\n\nEj: *"presupuesto alimentos 500"*');
        return;
    }
    
    if (cmd === 'borrar todo' || cmd === 'reset' || cmd === 'limpiar') {
        try {
            await hacerPeticion(`${API_URL}/api/empresas/${EMPRESA_ID}/invoices/clear-all`, { method: 'DELETE' });
            await responder('🗑️ *Todos los datos han sido eliminados*');
        } catch {
            await responder('❌ Error al borrar los datos.');
        }
        return;
    }
    
    // Comandos específicos de construcción
    if (config.rubro === 'construccion') {
        if (cmd === 'registrar material' || cmd.startsWith('registrar material ')) {
            await responder('🧱 *Registrar Material*\n\nFunción próximamente disponible.');
            return;
        }
        if (cmd === 'registrar obra' || cmd.startsWith('registrar obra ')) {
            await responder('🏗️ *Registrar Obra*\n\nFunción próximamente disponible.');
            return;
        }
        if (cmd === 'ver obras' || cmd === 'mis obras') {
            await responder('📋 *Mis Obras*\n\nFunción próximamente disponible.');
            return;
        }
        if (cmd === 'materiales') {
            await responder('📦 *Materiales*\n\nFunción próximamente disponible.');
            return;
        }
    }
    
    // Comandos específicos de tienda
    if (config.rubro === 'tienda' || config.rubro === 'restaurante') {
        if (cmd === 'inventario') {
            await responder('📦 *Inventario*\n\nFunción próximamente disponible.');
            return;
        }
        if (cmd === 'proveedores') {
            await responder('🏢 *Proveedores*\n\nFunción próximamente disponible.');
            return;
        }
    }
    
    // Comandos específicos de salud
    if (config.rubro === 'salud') {
        if (cmd === 'registrar paciente' || cmd.startsWith('registrar paciente ')) {
            await responder('👤 *Registrar Paciente*\n\nFunción próximamente disponible.');
            return;
        }
        if (cmd === 'citas hoy') {
            await responder('📅 *Citas de Hoy*\n\nFunción próximamente disponible.');
            return;
        }
    }
    
    // Si no se reconoce el comando
    await responder(`🤖 No entendí ese comando.\n\nEscribe *"hola"* para ver el menú de opciones.`);
}

// ─── FUNCIONES DE PROCESAMIENTO ──────────────────────────────

async function procesarGastos() {
    try {
        const stats = await hacerPeticion(`${API_URL}/api/empresas/${EMPRESA_ID}/invoices/stats`);
        
        let categorias = '';
        if (stats.categorias && stats.categorias.length > 0) {
            categorias = stats.categorias.slice(0, 5).map(c => 
                `• ${c.categoria}: $${c.total.toFixed(2)} (${c.count} facturas)`
            ).join('\n');
        } else {
            categorias = '• Aún no hay gastos registrados';
        }
        
        const respuesta = `📊 *Resumen Financiero*\n\n` +
            `💰 *Total gastado:* $${stats.total_gastado.toFixed(2)}\n` +
            `📄 *Facturas:* ${stats.total_facturas}\n` +
            `📈 *Promedio:* $${stats.promedio.toFixed(2)}\n\n` +
            `*Por categoría:*\n${categorias}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `📸 *Envía una foto* de tu factura para registrar\n` +
            `🔙 *"hola"* para volver al menú`;
        
        await responder(respuesta);
    } catch (error) {
        await responder('❌ Error al consultar tus gastos.');
    }
}

async function procesarFacturas() {
    try {
        const facturas = await hacerPeticion(`${API_URL}/api/empresas/${EMPRESA_ID}/invoices`);
        
        if (!facturas || facturas.length === 0) {
            await responder('📋 *No tienes facturas registradas aún*\n\nEnvía una foto de tu factura para empezar.');
            return;
        }
        
        const ultimas = facturas.slice(0, 5);
        let lista = ultimas.map((f, i) => 
            `${i+1}. *${f.proveedor}* - $${f.total.toFixed(2)}\n   📅 ${f.fecha} | ${f.categoria}`
        ).join('\n\n');
        
        const respuesta = `📋 *Últimas ${Math.min(5, facturas.length)} facturas:*\n\n${lista}\n\n━━━━━━━━━━━━━━━━━━━━━\n📊 *"gastos"* para ver resumen\n🔙 *"hola"* para volver al menú`;
        await responder(respuesta);
    } catch (error) {
        await responder('❌ Error al consultar facturas.');
    }
}

async function procesarPresupuesto(texto) {
    const partes = texto.split(' ');
    if (partes.length >= 2) {
        const categoria = partes.slice(0, -1).join(' ');
        const monto = parseFloat(partes[partes.length - 1]);
        
        if (!isNaN(monto) && monto > 0) {
            try {
                await hacerPeticion(`${API_URL}/api/empresas/${EMPRESA_ID}/budgets`, {
                    method: 'POST',
                    body: { categoria, limite: monto }
                });
                await responder(`💰 *Presupuesto actualizado*\n\n${categoria}: $${monto.toFixed(2)}/mes\n\n🔙 *"hola"* para volver al menú`);
            } catch {
                await responder('❌ Error al establecer presupuesto.');
            }
            return;
        }
    }
    await responder('❌ Formato: *"presupuesto [categoría] [monto]"*\n\nEj: *"presupuesto alimentos 500"*');
}

async function procesarAlertas() {
    try {
        const alerts = await hacerPeticion(`${API_URL}/api/empresas/${EMPRESA_ID}/alerts`);
        
        let respuesta;
        if (!alerts || alerts.length === 0) {
            respuesta = '✅ *No hay alertas*\n\nTus presupuestos están en orden.';
        } else {
            let lista = alerts.map(a => 
                `⚠️ *${a.categoria}*: $${a.gastado.toFixed(2)} de $${a.limite.toFixed(2)}`
            ).join('\n');
            respuesta = `🚨 *Alertas de Presupuesto*\n\n${lista}\n\n💰 Usa *"presupuesto [cat] [monto]"* para ajustar\n🔙 *"hola"* para volver al menú`;
        }
        
        await responder(respuesta);
    } catch {
        await responder('❌ Error al consultar alertas.');
    }
}

// ─── INICIAR CLIENTE DE WHATSAPP ─────────────────────────────

async function iniciarCliente() {
    // Cargar configuración primero
    const ok = await cargarConfiguracion();
    if (!ok) {
        console.log('🔄 Reintentando en 10 segundos...');
        setTimeout(iniciarCliente, 10000);
        return;
    }
    
    // Cargar comandos personalizados
    await cargarComandosPersonalizados();
    
    await actualizarEstado('conectando');
    
    if (client) {
        try { client.destroy(); } catch(e) {}
        client = null;
    }

    client = new Client({
        authStrategy: new LocalAuth({ clientId: `empresa-${EMPRESA_ID}` }),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
        }
    });

    // ─── EVENTOS ─────────────────────────────────────────────
    client.on('qr', async (qr) => {
        qrGenerado = qr;
        estado = 'esperando_escaneo';
        try {
            await qrcode.toFile(path.join(publicDir, `qr-${EMPRESA_ID}.png`), qr, {
                color: { dark: config.color_hex || '#00F5FF', light: '#0A0A1A' },
                width: 400, margin: 2
            });
            console.log(`✅ QR generado para ${config.empresa_nombre}`);
        } catch (err) {
            console.error('Error generando QR:', err);
        }
    });

    client.on('ready', async () => {
        estado = 'conectado';
        qrGenerado = null;
        await actualizarEstado('conectado');
        
        console.log('\n═══════════════════════════════════════════');
        console.log(`  ✅ BOT CONECTADO — ${config.empresa_nombre}`);
        console.log(`  🤖 ${config.nombre_bot}`);
        console.log(`  🏗️  Rubro: ${config.rubro}`);
        console.log(`  📱 Número: ${config.numero_whatsapp || 'No configurado'}`);
        console.log('═══════════════════════════════════════════\n');
        
        // Enviar mensaje de bienvenida
        await responder(config.menu);
    });

    client.on('authenticated', () => {
        console.log(`✅ Autenticado para ${config.empresa_nombre}`);
    });

    client.on('auth_failure', (msg) => {
        estado = 'error';
        console.error('❌ Error de autenticación:', msg);
    });

    client.on('disconnected', async (reason) => {
        estado = 'desconectado';
        await actualizarEstado('desconectado');
        console.log(`❌ Bot desconectado (${config.empresa_nombre}):`, reason);
        console.log('🔄 Reintentando en 5 segundos...');
        setTimeout(iniciarCliente, 5000);
    });

    // ─── PROCESAR MENSAJES ───────────────────────────────────
    client.on('message_create', async (msg) => {
        try {
            // Solo procesar mensajes del chat privado del dueño
            const chatId = getChatPrivadoId();
            if (!chatId || msg.from !== chatId) return;
            
            // Ignorar estados
            if (msg.from === 'status@broadcast') return;
            
            // ANTI-LOOP
            if (msg.fromMe && msg.body) {
                const texto = msg.body.toLowerCase().trim();
                const emojisRespuesta = ['✅', '📊', '📋', '💰', '⚠️', '🌐', '❓', '🤖', '📸', '🚨', '📝', '🗑️'];
                if (emojisRespuesta.some(emoji => texto.startsWith(emoji))) return;
            }
            
            const texto = (msg.body || '').toLowerCase().trim();
            if (!texto) return;
            
            console.log(`📩 [${config.empresa_nombre}]: "${texto.substring(0, 50)}"`);
            await client.sendSeen(msg.from);
            
            // ─── VERIFICAR SI HAY FORMULARIO ACTIVO ─────────
            const telefono = msg.from;
            if (formulariosActivos[telefono]) {
                await procesarRespuestaFormulario(texto, telefono);
                return;
            }
            
            // ─── VERIFICAR COMANDOS PERSONALIZADOS ──────────
            const procesadoPersonalizado = await procesarComandoPersonalizado(texto, msg);
            if (procesadoPersonalizado) return;
            
            // ─── PROCESAR IMAGEN (FACTURA) ──────────────────
            if (msg.hasMedia) {
                const media = await msg.downloadMedia();
                
                if (media.mimetype && media.mimetype.startsWith('image/')) {
                    await responder('📸 *Procesando factura...*\n\n⏳ Un momento por favor...');
                    
                    try {
                        const result = await hacerPeticion(`${API_URL}/api/empresas/${EMPRESA_ID}/invoices/upload-base64`, {
                            method: 'POST',
                            body: {
                                imagen: media.data,
                                mimetype: media.mimetype
                            }
                        });
                        
                        let respuesta;
                        if (result.status === 'ok') {
                            respuesta = `✅ *Factura registrada*\n\n` +
                                `🏢 *${result.datos.proveedor}*\n` +
                                `💰 *Total:* $${result.datos.total.toFixed(2)}\n` +
                                `📂 *Categoría:* ${result.datos.categoria}\n` +
                                `📅 *Fecha:* ${result.datos.fecha}\n\n`;
                            
                            if (result.analisis && result.analisis.insights && result.analisis.insights.length > 0) {
                                respuesta += `🔍 *Insights:*\n`;
                                result.analisis.insights.forEach(i => {
                                    respuesta += `${i}\n`;
                                });
                                respuesta += '\n';
                            }
                            
                            respuesta += `📊 *"gastos"* para ver resumen`;
                        } else if (result.status === 'duplicado') {
                            respuesta = '⚠️ *Factura duplicada*\n\nEsta factura ya fue registrada anteriormente.';
                        } else {
                            respuesta = '❌ Error al procesar la factura.';
                        }
                        
                        await responder(respuesta);
                    } catch (error) {
                        console.error('Error al procesar factura:', error);
                        await responder('❌ Error al procesar la factura. Asegúrate de que la imagen sea clara.');
                    }
                }
            }
            
        } catch (error) {
            console.error('Error general:', error);
        }
    });

    client.initialize();
}

// ─── SERVIDOR WEB ────────────────────────────────────────────
app.use(express.static(publicDir));

app.get('/api/status', (req, res) => {
    res.json({
        estado,
        empresa: config ? {
            id: EMPRESA_ID,
            nombre: config.empresa_nombre,
            nombre_bot: config.nombre_bot,
            rubro: config.rubro,
            color: config.color_hex
        } : null,
        qr: qrGenerado,
        timestamp: new Date().toISOString()
    });
});

app.get('/api/qr', async (req, res) => {
    if (!qrGenerado) return res.json({ qr: null, estado, empresa: config ? config.empresa_nombre : null });
    try {
        const qrDataUrl = await qrcode.toDataURL(qrGenerado, {
            color: { dark: config?.color_hex || '#00F5FF', light: '#0A0A1A' },
            width: 400, margin: 2
        });
        res.json({ qr: qrDataUrl, estado, empresa: config ? config.empresa_nombre : null });
    } catch (err) {
        res.status(500).json({ error: 'Error generando QR' });
    }
});

app.get('/', (req, res) => {
    const nombreEmpresa = config ? config.empresa_nombre : 'Cargando...';
    const color = config ? config.color_hex : '#00F5FF';
    
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${nombreEmpresa} — Bot de WhatsApp</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', sans-serif;
            background: #0A0A1A;
            color: #fff;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .bg-grid {
            position: fixed; top: 0; left: 0;
            width: 100%; height: 100%;
            background-image: 
                linear-gradient(rgba(0, 245, 255, 0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(0, 245, 255, 0.03) 1px, transparent 1px);
            background-size: 60px 60px;
            z-index: 0;
        }
        .container { position: relative; z-index: 1; text-align: center; padding: 20px; max-width: 500px; width: 100%; }
        .logo { font-size: 24px; font-weight: 800; margin-bottom: 4px; }
        .subtitle { color: rgba(255,255,255,0.5); font-size: 14px; margin-bottom: 40px; }
        .qr-card {
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 24px;
            padding: 40px;
            backdrop-filter: blur(20px);
        }
        .qr-container {
            width: 280px; height: 280px;
            margin: 0 auto 24px;
            border-radius: 16px;
            overflow: hidden;
            background: #0A0A1A;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid rgba(255,255,255,0.15);
        }
        .qr-container img { width: 100%; height: 100%; object-fit: contain; }
        .qr-spinner {
            width: 40px; height: 40px;
            border: 3px solid rgba(255,255,255,0.1);
            border-top-color: ${color};
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .status { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 16px; font-size: 14px; }
        .status-dot {
            width: 8px; height: 8px;
            border-radius: 50%;
            background: #666;
            animation: pulse 2s infinite;
        }
        .status-dot.connected { background: #00FF64; box-shadow: 0 0 10px rgba(0,255,100,0.5); }
        .status-dot.waiting { background: #FFD700; box-shadow: 0 0 10px rgba(255,215,0,0.5); }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .empresa-badge {
            display: inline-block;
            padding: 6px 16px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 500;
            margin-bottom: 20px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
        }
        .footer { margin-top: 24px; color: rgba(255,255,255,0.2); font-size: 12px; }
    </style>
</head>
<body>
    <div class="bg-grid"></div>
    <div class="container">
        <div class="logo" style="color: ${color}">✦ ${nombreEmpresa}</div>
        <div class="subtitle">Bot de WhatsApp — Escanea el QR para conectar</div>
        
        <div class="empresa-badge" id="empresaBadge">${config ? config.nombre_bot : 'Cargando...'}</div>
        
        <div class="qr-card">
            <div class="qr-container" id="qrContainer">
                <div class="qr-spinner" id="qrSpinner"></div>
                <img id="qrImage" style="display:none" alt="Código QR">
            </div>
            
            <div class="status">
                <div class="status-dot" id="statusDot"></div>
                <span id="statusText">Conectando...</span>
            </div>
        </div>
        
        <div class="footer">InvoiceFlow SaaS — ${nombreEmpresa}</div>
    </div>
    
    <script>
        async function checkStatus() {
            try {
                const res = await fetch('/api/qr');
                const data = await res.json();
                
                const qrImage = document.getElementById('qrImage');
                const qrSpinner = document.getElementById('qrSpinner');
                const statusDot = document.getElementById('statusDot');
                const statusText = document.getElementById('statusText');
                
                if (data.estado === 'conectado') {
                    qrImage.style.display = 'none';
                    qrSpinner.style.display = 'none';
                    statusDot.className = 'status-dot connected';
                    statusText.textContent = '✅ Conectado';
                    return;
                }
                
                if (data.qr) {
                    qrImage.src = data.qr;
                    qrImage.style.display = 'block';
                    qrSpinner.style.display = 'none';
                    statusDot.className = 'status-dot waiting';
                    statusText.textContent = '📱 Escanea el QR';
                } else {
                    qrImage.style.display = 'none';
                    qrSpinner.style.display = 'block';
                    statusDot.className = 'status-dot';
                    statusText.textContent = '⏳ Generando QR...';
                }
            } catch (err) {}
        }
        
        checkStatus();
        setInterval(checkStatus, 2000);
    </script>
</body>
</html>`);
});

// ─── INICIAR ──────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n    ╔══════════════════════════════════════╗`);
    console.log(`    ║     INVOICEFLOW — Bot Multi-Empresa  ║`);
    console.log(`    ║                                      ║`);
    console.log(`    ║  🏢 Empresa ID: ${EMPRESA_ID}${' '.repeat(15 - String(EMPRESA_ID).length)}║`);
    console.log(`    ║  🌐 http://localhost:${PORT}${' '.repeat(18 - String(PORT).length)}║`);
    console.log(`    ║  📱 Escanea QR con WhatsApp          ║`);
    console.log(`    ╚══════════════════════════════════════╝\n`);
});

// Iniciar
iniciarCliente();
