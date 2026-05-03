/**
 * INVOICEFLOW — Rutas de la API REST (Supabase)
 * 
 * Reemplaza completamente la API de FastAPI/Python y SQLite.
 * AHORA usa Supabase (PostgreSQL) como base de datos.
 * 
 * Endpoints:
 *   - /api/admin/empresas (CRUD)
 *   - /api/admin/empresas/:id/clientes (CRUD)
 *   - /api/empresas/:id/invoices (CRUD + stats + upload)
 *   - /api/empresas/:id/budgets
 *   - /api/empresas/:id/alerts
 *   - /api/empresas/:id/comandos (CRUD)
 *   - /api/empresas/:id/registros-formularios
 *   - /api/bot/:id/config
 *   - /api/bot/:id/status
 *   - /api/bot/:id/comandos-personalizados
 *   - /health
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { 
    getDb, initDb, rowToObj, rowsToArray, 
    obtenerEmpresaOError, COLORES_EMPRESA, PLANTILLAS_BOT,
    UPLOAD_DIR 
} = require('./database');

// ─── Inicializar BD al cargar ─────────────────────────────────
initDb().catch(err => {
    console.error('❌ Error al inicializar BD:', err);
    process.exit(1);
});

// ═══════════════════════════════════════════════════════════
//  HEALTH CHECK
// ═══════════════════════════════════════════════════════════

router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        version: '2.0.0',
        timestamp: new Date().toISOString()
    });
});

// ═══════════════════════════════════════════════════════════
//  ENDPOINTS DE ADMINISTRACIÓN (EMPRESAS)
// ═══════════════════════════════════════════════════════════

// Listar empresas con filtros
router.get('/api/admin/empresas', async (req, res) => {
    try {
        const client = getDb();
        const { rubro, activo, search, orden } = req.query;

        let query = client
            .from('empresas')
            .select(`
                *,
                bots_config!left(nombre_bot, estado, ultima_conexion)
            `);

        if (rubro) {
            query = query.eq('rubro', rubro);
        }
        if (activo !== undefined && activo !== '') {
            query = query.eq('activo', activo === 'true' || activo === '1');
        }
        if (search) {
            query = query.or(`nombre.ilike.%${search}%,notas.ilike.%${search}%`);
        }

        const ordenesValidas = {
            nombre: { column: 'nombre', ascending: true },
            nombre_desc: { column: 'nombre', ascending: false },
            rubro: { column: 'rubro', ascending: true },
            fecha: { column: 'created_at', ascending: false },
            fecha_asc: { column: 'created_at', ascending: true },
            color: { column: 'color', ascending: true }
        };
        const ordenConfig = ordenesValidas[orden] || { column: 'nombre', ascending: true };
        query = query.order(ordenConfig.column, { ascending: ordenConfig.ascending });

        const { data, error } = await query;

        if (error) throw error;

        const empresas = rowsToArray(data);
        res.json({ total: empresas.length, empresas });
    } catch (err) {
        res.status(500).json({ status: 'error', mensaje: err.message });
    }
});

// Obtener una empresa con detalles
router.get('/api/admin/empresas/:empresaId', async (req, res) => {
    try {
        const client = getDb();
        const empresaId = parseInt(req.params.empresaId);

        const { data: empresa, error } = await client
            .from('empresas')
            .select(`
                *,
                bots_config!left(nombre_bot, numero_whatsapp, plantilla, estado, ultima_conexion)
            `)
            .eq('id', empresaId)
            .single();

        if (error || !empresa) {
            return res.status(404).json({ status: 'error', mensaje: 'Empresa no encontrada' });
        }

        // Obtener clientes
        const { data: clientes } = await client
            .from('clientes')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('nombre', { ascending: true });

        empresa.clientes = rowsToArray(clientes);

        // Obtener estadísticas
        const { data: statsData } = await client
            .from('invoices')
            .select('id, total')
            .eq('empresa_id', empresaId);

        const stats = rowsToArray(statsData);
        const totalFacturas = stats.length;
        const totalGastado = stats.reduce((sum, inv) => sum + (inv.total || 0), 0);

        empresa.stats = {
            total_facturas: totalFacturas,
            total_gastado: Math.round(totalGastado * 100) / 100
        };

        res.json(empresa);
    } catch (err) {
        res.status(500).json({ status: 'error', mensaje: err.message });
    }
});

// Crear empresa
router.post('/api/admin/empresas', async (req, res) => {
    try {
        const client = getDb();
        const { nombre, rubro, color_idx, notas, nombre_bot } = req.body;

        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ status: 'error', mensaje: 'El nombre de la empresa es requerido' });
        }

        const rubroFinal = PLANTILLAS_BOT[rubro] ? rubro : 'general';
        const colorIdx = (color_idx || 0) % COLORES_EMPRESA.length;
        const color = COLORES_EMPRESA[colorIdx];

        const now = new Date().toISOString();

        // Crear empresa
        const { data: empresaData, error: empresaError } = await client
            .from('empresas')
            .insert({
                nombre: nombre.trim(),
                rubro: rubroFinal,
                color: color.hex,
                activo: true,
                created_at: now,
                notas: notas || ''
            })
            .select('id')
            .single();

        if (empresaError) throw empresaError;

        const empresaId = empresaData.id;

        // Crear configuración de bot por defecto
        const plantilla = PLANTILLAS_BOT[rubroFinal];
        const nombreBot = nombre_bot || `${plantilla.icono} ${nombre.trim()} Bot`;

        const { error: botError } = await client
            .from('bots_config')
            .insert({
                empresa_id: empresaId,
                nombre_bot: nombreBot,
                plantilla: rubroFinal,
                activo: true,
                estado: 'pendiente'
            });

        if (botError) throw botError;

        res.json({
            status: 'ok',
            mensaje: `✅ Empresa '${nombre.trim()}' creada exitosamente`,
            empresa_id: empresaId,
            color,
            plantilla
        });
    } catch (err) {
        res.status(500).json({ status: 'error', mensaje: `Error al crear empresa: ${err.message}` });
    }
});

// Actualizar empresa
router.put('/api/admin/empresas/:empresaId', async (req, res) => {
    try {
        const client = getDb();
        const empresaId = parseInt(req.params.empresaId);
        const data = req.body;

        const updateData = {};
        for (const campo of ['nombre', 'rubro', 'color', 'activo', 'notas']) {
            if (data[campo] !== undefined) {
                updateData[campo] = data[campo];
            }
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ status: 'error', mensaje: 'No hay campos para actualizar' });
        }

        const { error } = await client
            .from('empresas')
            .update(updateData)
            .eq('id', empresaId);

        if (error) throw error;

        // Actualizar nombre del bot si viene
        if (data.nombre_bot) {
            await client
                .from('bots_config')
                .update({ nombre_bot: data.nombre_bot })
                .eq('empresa_id', empresaId);
        }

        // Actualizar plantilla si viene
        if (data.plantilla && PLANTILLAS_BOT[data.plantilla]) {
            await client
                .from('bots_config')
                .update({ plantilla: data.plantilla })
                .eq('empresa_id', empresaId);
        }

        res.json({ status: 'ok', mensaje: '✅ Empresa actualizada' });
    } catch (err) {
        res.status(500).json({ status: 'error', mensaje: err.message });
    }
});

// Eliminar empresa (CASCADE elimina todo)
router.delete('/api/admin/empresas/:empresaId', async (req, res) => {
    try {
        const client = getDb();
        const empresaId = parseInt(req.params.empresaId);

        const { error } = await client
            .from('empresas')
            .delete()
            .eq('id', empresaId);

        if (error) throw error;

        res.json({ status: 'ok', mensaje: '🗑️ Empresa y todos sus datos eliminados' });
    } catch (err) {
        res.status(500).json({ status: 'error', mensaje: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  ENDPOINTS DE CLIENTES
// ═══════════════════════════════════════════════════════════

// Listar clientes
router.get('/api/admin/empresas/:empresaId/clientes', async (req, res) => {
    try {
        const client = getDb();
        const empresaId = parseInt(req.params.empresaId);

        const { data, error } = await client
            .from('clientes')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('nombre', { ascending: true });

        if (error) throw error;
        res.json(rowsToArray(data));
    } catch (err) {
        res.status(500).json({ status: 'error', mensaje: err.message });
    }
});

// Crear cliente
router.post('/api/admin/empresas/:empresaId/clientes', async (req, res) => {
    try {
        const client = getDb();
        const empresaId = parseInt(req.params.empresaId);
        const { nombre, cedula, telefono, email } = req.body;

        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ status: 'error', mensaje: 'El nombre es requerido' });
        }

        const { error } = await client
            .from('clientes')
            .insert({
                empresa_id: empresaId,
                nombre: nombre.trim(),
                cedula: cedula || '',
                telefono: telefono || '',
                email: email || '',
                created_at: new Date().toISOString()
            });

        if (error) throw error;

        res.json({ status: 'ok', mensaje: `✅ Cliente '${nombre.trim()}' agregado` });
    } catch (err) {
        res.status(500).json({ status: 'error', mensaje: err.message });
    }
});

// Actualizar cliente
router.put('/api/admin/clientes/:clienteId', async (req, res) => {
    try {
        const client = getDb();
        const clienteId = parseInt(req.params.clienteId);
        const data = req.body;

        const updateData = {};
        for (const campo of ['nombre', 'cedula', 'telefono', 'email', 'activo']) {
            if (data[campo] !== undefined) {
                updateData[campo] = data[campo];
            }
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ status: 'error', mensaje: 'No hay campos para actualizar' });
        }

        const { error } = await client
            .from('clientes')
            .update(updateData)
            .eq('id', clienteId);

        if (error) throw error;

        res.json({ status: 'ok', mensaje: '✅ Cliente actualizado' });
    } catch (err) {
        res.status(500).json({ status: 'error', mensaje: err.message });
    }
});

// Eliminar cliente
router.delete('/api/admin/clientes/:clienteId', async (req, res) => {
    try {
        const client = getDb();
        const clienteId = parseInt(req.params.clienteId);

        const { error } = await client
            .from('clientes')
            .delete()
            .eq('id', clienteId);

        if (error) throw error;

        res.json({ status: 'ok', mensaje: '🗑️ Cliente eliminado' });
    } catch (err) {
        res.status(500).json({ status: 'error', mensaje: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  ENDPOINTS DE FACTURAS (MULTI-EMPRESA)
// ═══════════════════════════════════════════════════════════

// Subir factura por archivo
router.post('/api/empresas/:empresaId/invoices/upload', async (req, res) => {
    try {
        const empresaId = parseInt(req.params.empresaId);
        await obtenerEmpresaOError(empresaId);

        if (!req.files || !req.files.file) {
            return res.status(400).json({ status: 'error', mensaje: 'No se recibió ningún archivo' });
        }

        const file = req.files.file;
        const resultado = await procesarYGuardarFactura(file.data, empresaId);
        res.json(resultado);
    } catch (err) {
        res.status(err.statusCode || 500).json({ status: 'error', mensaje: err.message });
    }
});

// Subir factura por base64 (desde el bot)
router.post('/api/empresas/:empresaId/invoices/upload-base64', async (req, res) => {
    try {
        const empresaId = parseInt(req.params.empresaId);
        await obtenerEmpresaOError(empresaId);

        const { imagen } = req.body;
        if (!imagen) {
            return res.status(400).json({ status: 'error', mensaje: 'No se recibió ninguna imagen' });
        }

        const contenido = Buffer.from(imagen, 'base64');
        const resultado = await procesarYGuardarFactura(contenido, empresaId);
        res.json(resultado);
    } catch (err) {
        res.status(err.statusCode || 500).json({
            status: 'error',
            mensaje: `❌ Error al procesar: ${err.message}`
        });
    }
});

// Listar facturas
router.get('/api/empresas/:empresaId/invoices', async (req, res) => {
    try {
        const empresaId = parseInt(req.params.empresaId);
        await obtenerEmpresaOError(empresaId);

        const client = getDb();
        const limit = parseInt(req.query.limit) || 50;

        const { data, error } = await client
            .from('invoices')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;

        res.json(rowsToArray(data));
    } catch (err) {
        res.status(err.statusCode || 500).json({ status: 'error', mensaje: err.message });
    }
});

// Estadísticas de facturas
router.get('/api/empresas/:empresaId/invoices/stats', async (req, res) => {
    try {
        const empresaId = parseInt(req.params.empresaId);
        await obtenerEmpresaOError(empresaId);

        const client = getDb();

        // Total gastado y conteo
        const { data: allInvoices } = await client
            .from('invoices')
            .select('id, total, categoria, proveedor, fecha')
            .eq('empresa_id', empresaId);

        const invoices = rowsToArray(allInvoices);
        const totalGastadoVal = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
        const totalFacturasVal = invoices.length;

        // Categorías
        const categoriasMap = {};
        for (const inv of invoices) {
            const cat = inv.categoria || 'Sin categoría';
            if (!categoriasMap[cat]) categoriasMap[cat] = { total: 0, count: 0 };
            categoriasMap[cat].total += inv.total || 0;
            categoriasMap[cat].count += 1;
        }
        const categorias = Object.entries(categoriasMap)
            .map(([categoria, data]) => ({ categoria, total: Math.round(data.total * 100) / 100, count: data.count }))
            .sort((a, b) => b.total - a.total);

        // Meses (últimos 6)
        const mesesMap = {};
        for (const inv of invoices) {
            if (inv.fecha) {
                const mes = inv.fecha.substring(0, 7);
                if (!mesesMap[mes]) mesesMap[mes] = 0;
                mesesMap[mes] += inv.total || 0;
            }
        }
        const meses = Object.entries(mesesMap)
            .map(([mes, total]) => ({ mes, total: Math.round(total * 100) / 100 }))
            .sort((a, b) => a.mes.localeCompare(b.mes))
            .slice(-6);

        // Proveedores (top 5)
        const proveedoresMap = {};
        for (const inv of invoices) {
            const prov = inv.proveedor || 'Desconocido';
            if (!proveedoresMap[prov]) proveedoresMap[prov] = { total: 0, count: 0 };
            proveedoresMap[prov].total += inv.total || 0;
            proveedoresMap[prov].count += 1;
        }
        const proveedores = Object.entries(proveedoresMap)
            .map(([proveedor, data]) => ({ proveedor, total: Math.round(data.total * 100) / 100, count: data.count }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);

        res.json({
            total_gastado: Math.round(totalGastadoVal * 100) / 100,
            total_facturas: totalFacturasVal,
            promedio: totalFacturasVal > 0 ? Math.round((totalGastadoVal / totalFacturasVal) * 100) / 100 : 0,
            categorias,
            meses,
            proveedores
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({ status: 'error', mensaje: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  ENDPOINTS DE PRESUPUESTOS
// ═══════════════════════════════════════════════════════════

// Establecer presupuesto
router.post('/api/empresas/:empresaId/budgets', async (req, res) => {
    try {
        const empresaId = parseInt(req.params.empresaId);
        await obtenerEmpresaOError(empresaId);

        const { categoria, limite } = req.body;
        if (!categoria || !limite) {
            return res.status(400).json({ status: 'error', mensaje: 'Faltan datos: categoria y limite son requeridos' });
        }

        const mes = new Date().toISOString().substring(0, 7);
        const client = getDb();

        // UPSERT: insertar o actualizar
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
                .update({ limite: parseFloat(limite) })
                .eq('id', existing.id);
        } else {
            await client
                .from('budgets')
                .insert({
                    empresa_id: empresaId,
                    categoria,
                    limite: parseFloat(limite),
                    mes
                });
        }

        res.json({ status: 'ok', mensaje: `Presupuesto de $${parseFloat(limite)} para ${categoria}` });
    } catch (err) {
        res.status(err.statusCode || 500).json({ status: 'error', mensaje: err.message });
    }
});

// Alertas de presupuesto
router.get('/api/empresas/:empresaId/alerts', async (req, res) => {
    try {
        const empresaId = parseInt(req.params.empresaId);
        await obtenerEmpresaOError(empresaId);

        const client = getDb();

        // Obtener todos los presupuestos
        const { data: budgets } = await client
            .from('budgets')
            .select('*')
            .eq('empresa_id', empresaId);

        // Obtener todas las facturas
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

        res.json(alerts);
    } catch (err) {
        res.status(err.statusCode || 500).json({ status: 'error', mensaje: err.message });
    }
});

// Borrar todas las facturas de una empresa
router.delete('/api/empresas/:empresaId/invoices/clear-all', async (req, res) => {
    try {
        const empresaId = parseInt(req.params.empresaId);
        await obtenerEmpresaOError(empresaId);

        const client = getDb();

        await client.from('invoices').delete().eq('empresa_id', empresaId);
        await client.from('budgets').delete().eq('empresa_id', empresaId);

        res.json({ status: 'ok', mensaje: '✅ Todos los datos han sido eliminados' });
    } catch (err) {
        res.status(err.statusCode || 500).json({ status: 'error', mensaje: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  ENDPOINTS PARA EL BOT DE WHATSAPP
// ═══════════════════════════════════════════════════════════

// Obtener configuración del bot
router.get('/api/bot/:empresaId/config', async (req, res) => {
    try {
        const client = getDb();
        const empresaId = parseInt(req.params.empresaId);

        const { data: config, error } = await client
            .from('bots_config')
            .select(`
                *,
                empresas!inner(nombre, rubro, color)
            `)
            .eq('empresa_id', empresaId)
            .eq('activo', true)
            .single();

        if (error || !config) {
            return res.status(404).json({ status: 'error', mensaje: 'Configuración de bot no encontrada' });
        }

        // Extraer datos de la empresa desde el objeto anidado 'empresas'
        if (config.empresas) {
            config.empresa_nombre = config.empresas.nombre;
            config.rubro = config.empresas.rubro;
            config.color = config.empresas.color;
            delete config.empresas;
        }

        // Agregar comandos según la plantilla
        const plantilla = PLANTILLAS_BOT[config.plantilla] || PLANTILLAS_BOT.general;
        config.comandos = plantilla.comandos;
        config.menu = generarMenuEmpresa(config.empresa_nombre || config.nombre, config.nombre_bot, plantilla);

        res.json(config);
    } catch (err) {
        res.status(500).json({ status: 'error', mensaje: err.message });
    }
});

// Actualizar estado del bot
router.post('/api/bot/:empresaId/status', async (req, res) => {
    try {
        const client = getDb();
        const empresaId = parseInt(req.params.empresaId);
        const { estado } = req.body;

        const { error } = await client
            .from('bots_config')
            .update({
                estado: estado || 'desconectado',
                ultima_conexion: new Date().toISOString()
            })
            .eq('empresa_id', empresaId);

        if (error) throw error;

        res.json({ status: 'ok' });
    } catch (err) {
        res.status(500).json({ status: 'error', mensaje: err.message });
    }
});

// Obtener comandos personalizados para el bot
router.get('/api/bot/:empresaId/comandos-personalizados', async (req, res) => {
    try {
        const client = getDb();
        const empresaId = parseInt(req.params.empresaId);

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

        res.json(comandos);
    } catch (err) {
        res.status(500).json({ status: 'error', mensaje: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  ENDPOINTS DE COMANDOS PERSONALIZADOS
// ═══════════════════════════════════════════════════════════

// Listar comandos personalizados
router.get('/api/empresas/:empresaId/comandos', async (req, res) => {
    try {
        const empresaId = parseInt(req.params.empresaId);
        await obtenerEmpresaOError(empresaId);

        const client = getDb();
        let query = client
            .from('comandos_personalizados')
            .select('*')
            .eq('empresa_id', empresaId);

        if (req.query.activo !== undefined) {
            query = query.eq('activo', req.query.activo === 'true' || req.query.activo === '1');
        }

        const { data, error } = await query.order('comando', { ascending: true });

        if (error) throw error;

        const comandos = rowsToArray(data);

        // Parsear config
        for (const cmd of comandos) {
            if (typeof cmd.config === 'string') {
                try {
                    cmd.config = JSON.parse(cmd.config);
                } catch {
                    cmd.config = {};
                }
            }
        }

        res.json(comandos);
    } catch (err) {
        res.status(err.statusCode || 500).json({ status: 'error', mensaje: err.message });
    }
});

// Crear comando personalizado
router.post('/api/empresas/:empresaId/comandos', async (req, res) => {
    try {
        const empresaId = parseInt(req.params.empresaId);
        await obtenerEmpresaOError(empresaId);

        const { comando, descripcion, tipo, config } = req.body;

        if (!comando || !comando.trim()) {
            return res.status(400).json({ status: 'error', mensaje: 'El comando es requerido' });
        }

        const comandoLower = comando.trim().toLowerCase();

        if (tipo && !['simple', 'formulario'].includes(tipo)) {
            return res.status(400).json({ status: 'error', mensaje: "El tipo debe ser 'simple' o 'formulario'" });
        }

        const client = getDb();

        // Verificar duplicado
        const { data: existente } = await client
            .from('comandos_personalizados')
            .select('id')
            .eq('empresa_id', empresaId)
            .eq('comando', comandoLower)
            .maybeSingle();

        if (existente) {
            return res.status(409).json({ status: 'error', mensaje: `El comando '${comandoLower}' ya existe para esta empresa` });
        }

        const { error } = await client
            .from('comandos_personalizados')
            .insert({
                empresa_id: empresaId,
                comando: comandoLower,
                descripcion: descripcion || '',
                tipo: tipo || 'simple',
                config: JSON.stringify(config || {}),
                activo: true
            });

        if (error) throw error;

        res.json({ status: 'ok', mensaje: `✅ Comando '${comandoLower}' creado exitosamente` });
    } catch (err) {
        res.status(err.statusCode || 500).json({ status: 'error', mensaje: err.message });
    }
});

// Actualizar comando personalizado
router.put('/api/empresas/:empresaId/comandos/:comandoId', async (req, res) => {
    try {
        const empresaId = parseInt(req.params.empresaId);
        const comandoId = parseInt(req.params.comandoId);
        await obtenerEmpresaOError(empresaId);

        const client = getDb();

        // Verificar que exista
        const { data: existente } = await client
            .from('comandos_personalizados')
            .select('id')
            .eq('id', comandoId)
            .eq('empresa_id', empresaId)
            .maybeSingle();

        if (!existente) {
            return res.status(404).json({ status: 'error', mensaje: 'Comando no encontrado' });
        }

        const data = req.body;
        const updateData = {};

        for (const campo of ['comando', 'descripcion', 'tipo', 'activo']) {
            if (data[campo] !== undefined) {
                updateData[campo] = campo === 'comando' ? data[campo].trim().toLowerCase() : data[campo];
            }
        }

        if (data.config !== undefined) {
            updateData.config = JSON.stringify(data.config);
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ status: 'error', mensaje: 'No hay campos para actualizar' });
        }

        const { error } = await client
            .from('comandos_personalizados')
            .update(updateData)
            .eq('id', comandoId);

        if (error) throw error;

        res.json({ status: 'ok', mensaje: '✅ Comando actualizado' });
    } catch (err) {
        res.status(err.statusCode || 500).json({ status: 'error', mensaje: err.message });
    }
});

// Eliminar comando personalizado
router.delete('/api/empresas/:empresaId/comandos/:comandoId', async (req, res) => {
    try {
        const empresaId = parseInt(req.params.empresaId);
        const comandoId = parseInt(req.params.comandoId);
        await obtenerEmpresaOError(empresaId);

        const client = getDb();

        const { data: row } = await client
            .from('comandos_personalizados')
            .select('comando')
            .eq('id', comandoId)
            .eq('empresa_id', empresaId)
            .single();

        if (!row) {
            return res.status(404).json({ status: 'error', mensaje: 'Comando no encontrado' });
        }

        const { error } = await client
            .from('comandos_personalizados')
            .delete()
            .eq('id', comandoId);

        if (error) throw error;

        res.json({ status: 'ok', mensaje: `🗑️ Comando '${row.comando}' eliminado` });
    } catch (err) {
        res.status(err.statusCode || 500).json({ status: 'error', mensaje: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  ENDPOINTS DE REGISTROS DE FORMULARIOS
// ═══════════════════════════════════════════════════════════

// Guardar registro de formulario
router.post('/api/empresas/:empresaId/registros-formularios', async (req, res) => {
    try {
        const empresaId = parseInt(req.params.empresaId);
        await obtenerEmpresaOError(empresaId);

        const { comando, comando_id, telefono, datos } = req.body;

        if (!comando || !telefono) {
            return res.status(400).json({ status: 'error', mensaje: 'Faltan datos requeridos' });
        }

        const client = getDb();
        const { error } = await client
            .from('registros_formularios')
            .insert({
                empresa_id: empresaId,
                comando_id: comando_id || null,
                comando,
                telefono,
                datos: JSON.stringify(datos || {}),
                created_at: new Date().toISOString()
            });

        if (error) throw error;

        res.json({ status: 'ok', mensaje: '✅ Registro guardado' });
    } catch (err) {
        res.status(err.statusCode || 500).json({ status: 'error', mensaje: err.message });
    }
});

// Listar registros de formularios
router.get('/api/empresas/:empresaId/registros-formularios', async (req, res) => {
    try {
        const empresaId = parseInt(req.params.empresaId);
        await obtenerEmpresaOError(empresaId);

        const client = getDb();
        const limit = parseInt(req.query.limit) || 50;

        const { data, error } = await client
            .from('registros_formularios')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;

        const registros = rowsToArray(data);

        // Parsear datos de JSON string a objeto
        for (const reg of registros) {
            if (typeof reg.datos === 'string') {
                try {
                    reg.datos = JSON.parse(reg.datos);
                } catch {
                    reg.datos = {};
                }
            }
        }

        res.json(registros);
    } catch (err) {
        res.status(err.statusCode || 500).json({ status: 'error', mensaje: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  FUNCIONES AUXILIARES
// ═══════════════════════════════════════════════════════════

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
        'inventario cocina': '🍳 Inventario cocina',
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

    // Facturas del mes
    const { data: invoicesMes } = await client
        .from('invoices')
        .select('id, total')
        .eq('empresa_id', empresaId)
        .gte('fecha', `${mesActual}-01`)
        .lte('fecha', `${mesActual}-31`);

    const invoicesArr = rowsToArray(invoicesMes);
    const totalMes = invoicesArr.reduce((sum, inv) => sum + (inv.total || 0), 0);

    // Gastos previos con este proveedor
    const { data: previos } = await client
        .from('invoices')
        .select('id')
        .eq('empresa_id', empresaId)
        .eq('proveedor', datos.proveedor);

    const gastosPrevios = rowsToArray(previos).length;

    // Posibles duplicados
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
                created_at: new Date().toISOString(),
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

// ═══════════════════════════════════════════════════════════
//  EXPORTAR
// ═══════════════════════════════════════════════════════════

module.exports = router;
