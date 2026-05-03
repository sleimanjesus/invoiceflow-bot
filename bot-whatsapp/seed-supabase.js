// ============================================================
// INVOICEFLOW — Seed de datos de prueba para Supabase
// ============================================================
// Ejecutar: node seed-supabase.js
// ============================================================

require('dotenv').config({ path: __dirname + '/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function seed() {
    console.log('🌱 Insertando datos de prueba en Supabase...\n');

    // 1. Crear empresa de prueba
    const { data: empresa, error: errEmp } = await supabase
        .from('empresas')
        .insert({
            nombre: 'Mi Empresa Demo',
            rubro: 'general',
            color: '#00d4aa',
            activo: true,
            config_json: JSON.stringify({ notas: 'Empresa de prueba creada por seed' })
        })
        .select()
        .single();

    if (errEmp) {
        console.log('❌ Error creando empresa:', errEmp.message);
        return;
    }
    console.log(`✅ Empresa creada: ID=${empresa.id} - "${empresa.nombre}"`);

    // 2. Crear configuración del bot
    const { error: errBot } = await supabase
        .from('bots_config')
        .insert({
            empresa_id: empresa.id,
            nombre_bot: 'InvoiceFlow Bot Demo',
            numero_whatsapp: '584161234567',
            plantilla: 'general',
            activo: true,
            estado: 'desconectado'
        });

    if (errBot) {
        console.log('❌ Error creando bots_config:', errBot.message);
        return;
    }
    console.log('✅ Configuración de bot creada');

    // 3. Crear cliente de prueba
    const { data: cliente, error: errCli } = await supabase
        .from('clientes')
        .insert({
            empresa_id: empresa.id,
            nombre: 'Juan Pérez',
            cedula: 'V-12345678',
            telefono: '584161234568',
            email: 'juan@ejemplo.com'
        })
        .select()
        .single();

    if (errCli) {
        console.log('❌ Error creando cliente:', errCli.message);
        return;
    }
    console.log(`✅ Cliente creado: "${cliente.nombre}"`);

    // 4. Crear facturas de prueba
    const facturas = [
        { proveedor: 'Electricidad C.A.', total: 250.00, categoria: 'servicios', tipo_gasto: 'fijo' },
        { proveedor: 'Supermercado XYZ', total: 180.50, categoria: 'alimentos', tipo_gasto: 'variable' },
        { proveedor: 'Transporte Urbano', total: 45.00, categoria: 'transporte', tipo_gasto: 'variable' },
        { proveedor: 'Internet Plus', total: 120.00, categoria: 'servicios', tipo_gasto: 'fijo' },
        { proveedor: 'Farmacia Salud', total: 95.30, categoria: 'salud', tipo_gasto: 'variable' }
    ];

    for (const f of facturas) {
        const { error: errInv } = await supabase
            .from('invoices')
            .insert({
                empresa_id: empresa.id,
                cliente_id: cliente.id,
                proveedor: f.proveedor,
                fecha: new Date().toISOString().split('T')[0],
                total: f.total,
                categoria: f.categoria,
                tipo_gasto: f.tipo_gasto,
                fecha_registro: new Date().toISOString()
            });
        if (errInv) console.log(`❌ Error creando factura ${f.proveedor}:`, errInv.message);
    }
    console.log(`✅ ${facturas.length} facturas creadas`);

    // 5. Crear presupuestos
    const presupuestos = [
        { categoria: 'servicios', limite: 500 },
        { categoria: 'alimentos', limite: 300 },
        { categoria: 'transporte', limite: 200 },
        { categoria: 'salud', limite: 400 }
    ];

    const mesActual = new Date().toISOString().slice(0, 7); // YYYY-MM

    for (const p of presupuestos) {
        const { error: errBud } = await supabase
            .from('budgets')
            .insert({
                empresa_id: empresa.id,
                categoria: p.categoria,
                limite: p.limite,
                mes: mesActual
            });
        if (errBud) console.log(`❌ Error creando presupuesto ${p.categoria}:`, errBud.message);
    }
    console.log(`✅ ${presupuestos.length} presupuestos creados`);

    // 6. Crear comandos personalizados de prueba
    const comandos = [
        { 
            comando: 'horario', 
            descripcion: 'Ver horario de atención', 
            tipo: 'simple', 
            config: JSON.stringify({ mensaje: '🕐 *Horario de atención:*\nLunes a Viernes: 8am - 5pm\nSábados: 9am - 12pm' }) 
        },
        { 
            comando: 'contacto', 
            descripcion: 'Información de contacto', 
            tipo: 'simple', 
            config: JSON.stringify({ mensaje: '📞 *Contacto:*\nTeléfono: 0412-1234567\nEmail: info@ejemplo.com' }) 
        },
        { 
            comando: 'registro', 
            descripcion: 'Registrar un nuevo cliente', 
            tipo: 'formulario', 
            config: JSON.stringify({ 
                campos: [
                    { nombre: 'nombre', etiqueta: '👤 ¿Cuál es tu nombre completo?' },
                    { nombre: 'cedula', etiqueta: '🆔 ¿Cuál es tu cédula?' },
                    { nombre: 'telefono', etiqueta: '📱 ¿Cuál es tu teléfono?' }
                ],
                mensaje_final: '✅ *Cliente registrado exitosamente*'
            }) 
        }
    ];

    for (const c of comandos) {
        const { error: errCmd } = await supabase
            .from('comandos_personalizados')
            .insert({
                empresa_id: empresa.id,
                comando: c.comando,
                descripcion: c.descripcion,
                tipo: c.tipo,
                config: c.config,
                activo: true
            });
        if (errCmd) console.log(`❌ Error creando comando ${c.comando}:`, errCmd.message);
    }
    console.log(`✅ ${comandos.length} comandos personalizados creados`);

    console.log('\n🎉 Seed completado exitosamente!');
    console.log(`\nResumen:`);
    console.log(`  Empresa ID: ${empresa.id}`);
    console.log(`  Nombre: ${empresa.nombre}`);
    console.log(`  Clientes: 1`);
    console.log(`  Facturas: ${facturas.length}`);
    console.log(`  Presupuestos: ${presupuestos.length}`);
    console.log(`  Comandos: ${comandos.length}`);
}

seed().catch(console.error);
