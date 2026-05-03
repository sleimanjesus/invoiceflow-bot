#!/usr/bin/env node
/**
 * ============================================================
 * INVOICEFLOW — Script de Migración de SQLite a Supabase
 * ============================================================
 * 
 * Este script:
 * 1. Verifica/instala @supabase/supabase-js
 * 2. Crea /src/db/supabase.js con el cliente inicializado
 * 3. Ajusta database.js, routes.js y botManager.js para usar Supabase
 * 4. Opcional: ejecuta seed de datos de prueba (--seed)
 * 
 * Uso:
 *   node scripts/migrate-to-supabase.js          # Solo migración
 *   node scripts/migrate-to-supabase.js --seed    # Migración + datos de prueba
 * 
 * Requisitos:
 *   - SUPABASE_URL y SUPABASE_KEY en bot-whatsapp/.env
 *   - Tablas creadas en Supabase (ejecutar supabase-migration.sql)
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── CONFIGURACIÓN ─────────────────────────────────────────────
const ROOT = path.join(__dirname, '..');
const BOT_DIR = path.join(ROOT, 'bot-whatsapp');
const SRC_DIR = path.join(ROOT, 'src');
const DB_DIR = path.join(SRC_DIR, 'db');
const ENV_PATH = path.join(BOT_DIR, '.env');

// Archivos a modificar
const ARCHIVOS = {
    'src/db/supabase.js': null, // se crea
    'src/api/database.js': path.join(SRC_DIR, 'api', 'database.js'),
    'src/api/routes.js': path.join(SRC_DIR, 'api', 'routes.js'),
    'src/bot/botManager.js': path.join(SRC_DIR, 'bot', 'botManager.js'),
};

// ─── COLORES ───────────────────────────────────────────────────
const COLOR_RESET = '\x1b[0m';
const COLOR_GREEN = '\x1b[32m';
const COLOR_YELLOW = '\x1b[33m';
const COLOR_RED = '\x1b[31m';
const COLOR_CYAN = '\x1b[36m';
const COLOR_BOLD = '\x1b[1m';

function log(msg, color = '') {
    console.log(`${color}${msg}${COLOR_RESET}`);
}

function success(msg) { log(`✅ ${msg}`, COLOR_GREEN); }
function warn(msg) { log(`⚠️  ${msg}`, COLOR_YELLOW); }
function error(msg) { log(`❌ ${msg}`, COLOR_RED); }
function info(msg) { log(`ℹ️  ${msg}`, COLOR_CYAN); }
function title(msg) { 
    console.log(`\n${COLOR_BOLD}${COLOR_CYAN}═══════════════════════════════════════════`);
    console.log(`  ${msg}`);
    console.log(`═══════════════════════════════════════════${COLOR_RESET}\n`);
}

// ─── PASO 1: VERIFICAR/INSTALAR DEPENDENCIAS ──────────────────

function paso1_instalarDependencias() {
    title('PASO 1: Verificando dependencias');

    // Verificar si @supabase/supabase-js está instalado
    const packageJsonPath = path.join(BOT_DIR, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    if (!deps['@supabase/supabase-js']) {
        info('Instalando @supabase/supabase-js...');
        try {
            execSync('npm install @supabase/supabase-js', { 
                cwd: BOT_DIR, 
                stdio: 'pipe' 
            });
            success('@supabase/supabase-js instalado');
        } catch (e) {
            error(`No se pudo instalar: ${e.message}`);
            info('Ejecuta manualmente: cd bot-whatsapp && npm install @supabase/supabase-js');
        }
    } else {
        success('@supabase/supabase-js ya está instalado');
    }

    if (!deps['dotenv']) {
        info('Instalando dotenv...');
        try {
            execSync('npm install dotenv', { 
                cwd: BOT_DIR, 
                stdio: 'pipe' 
            });
            success('dotenv instalado');
        } catch (e) {
            warn(`No se pudo instalar dotenv: ${e.message}`);
        }
    } else {
        success('dotenv ya está instalado');
    }
}

// ─── PASO 2: VERIFICAR .env ────────────────────────────────────

function paso2_verificarEnv() {
    title('PASO 2: Verificando configuración');

    if (!fs.existsSync(ENV_PATH)) {
        error(`No se encuentra ${ENV_PATH}`);
        info('Crea el archivo con:');
        info('  SUPABASE_URL=https://tu-proyecto.supabase.co');
        info('  SUPABASE_KEY=eyJhbGciOiJIUzI1NiIs...');
        process.exit(1);
    }

    const envContent = fs.readFileSync(ENV_PATH, 'utf8');
    const supabaseUrl = envContent.match(/SUPABASE_URL=(.+)/)?.[1]?.trim();
    const supabaseKey = envContent.match(/SUPABASE_KEY=(.+)/)?.[1]?.trim();

    if (!supabaseUrl || supabaseUrl.includes('tu-proyecto')) {
        error('SUPABASE_URL no configurada en .env');
        process.exit(1);
    }

    if (!supabaseKey || supabaseKey.length < 20) {
        error('SUPABASE_KEY no configurada o inválida en .env');
        process.exit(1);
    }

    success(`SUPABASE_URL: ${supabaseUrl}`);
    success(`SUPABASE_KEY: ${supabaseKey.substring(0, 20)}...`);
}

// ─── PASO 3: CREAR /src/db/supabase.js ─────────────────────────

function paso3_crearClienteSupabase() {
    title('PASO 3: Creando cliente Supabase');

    if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
    }

    const supabaseJsPath = path.join(DB_DIR, 'supabase.js');
    
    const content = `/**
 * INVOICEFLOW — Cliente Supabase
 * 
 * Singleton del cliente @supabase/supabase-js.
 * Lee SUPABASE_URL y SUPABASE_KEY desde el .env.
 * 
 * Uso:
 *   const supabase = require('./src/db/supabase');
 *   const { data, error } = await supabase.from('empresas').select('*');
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Cargar variables de entorno
require('dotenv').config({ path: path.join(__dirname, '..', '..', 'bot-whatsapp', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

let cliente = null;

/**
 * Obtiene la instancia del cliente Supabase (singleton)
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function getSupabase() {
    if (!cliente) {
        if (!SUPABASE_URL || !SUPABASE_KEY) {
            throw new Error(
                '❌ ERROR: Debes configurar SUPABASE_URL y SUPABASE_KEY en bot-whatsapp/.env\\n' +
                '  1. Crea un proyecto en https://supabase.com\\n' +
                '  2. Ve a Project Settings > API\\n' +
                '  3. Copia la URL y anon/public key al archivo .env'
            );
        }
        cliente = createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return cliente;
}

/**
 * Verifica la conexión a Supabase
 */
async function testConnection() {
    try {
        const supabase = getSupabase();
        const { error } = await supabase.from('empresas').select('count', { count: 'exact', head: true });
        if (error) throw error;
        return true;
    } catch (err) {
        console.error('❌ Error de conexión a Supabase:', err.message);
        return false;
    }
}

module.exports = { getSupabase, testConnection };
`;

    fs.writeFileSync(supabaseJsPath, content, 'utf8');
    success(`Creado: src/db/supabase.js`);
}

// ─── PASO 4: RESPALDAR Y ACTUALIZAR ARCHIVOS ──────────────────

function paso4_respaldarYActualizar() {
    title('PASO 4: Actualizando archivos para usar Supabase');

    const archivosModificados = [];

    // 4a. Actualizar database.js
    const dbPath = path.join(SRC_DIR, 'api', 'database.js');
    if (fs.existsSync(dbPath)) {
        // Respaldar
        const bakPath = dbPath + '.bak';
        if (!fs.existsSync(bakPath)) {
            fs.copyFileSync(dbPath, bakPath);
            success(`Respaldo creado: src/api/database.js.bak`);
        }

        let content = fs.readFileSync(dbPath, 'utf8');

        // Ajustar: activo: 1 → activo: true (para booleanos de Supabase)
        content = content.replace(/\.eq\('activo',\s*1\)/g, ".eq('activo', true)");
        content = content.replace(/\.eq\('activo',\s*0\)/g, ".eq('activo', false)");
        content = content.replace(/activo:\s*1/g, 'activo: true');
        content = content.replace(/activo:\s*0/g, 'activo: false');

        // Ajustar: color_hex → color (columna real en Supabase)
        content = content.replace(/color_hex/g, 'color');
        
        // Ajustar: color_nombre → se elimina (no existe en Supabase)
        content = content.replace(/,\s*color_nombre:\s*COLORES_EMPRESA\[colorIdx\]\.nombre/g, '');
        content = content.replace(/color_nombre/g, 'color');

        // Ajustar: fecha_registro → created_at (columna real en Supabase)
        // Solo en inserts de empresas
        content = content.replace(/fecha_registro:\s*now/g, 'created_at: now');
        content = content.replace(/fecha_registro:\s*new\s+Date\(\)\.toISOString\(\)/g, 'created_at: new Date().toISOString()');

        // Ajustar: parseInt(activo) para queries
        content = content.replace(/parseInt\(activo\)/g, 'activo === "true" || activo === "1"');

        fs.writeFileSync(dbPath, content, 'utf8');
        archivosModificados.push('src/api/database.js');
        success('Actualizado: src/api/database.js');
    }

    // 4b. Actualizar routes.js
    const routesPath = path.join(SRC_DIR, 'api', 'routes.js');
    if (fs.existsSync(routesPath)) {
        const bakPath = routesPath + '.bak';
        if (!fs.existsSync(bakPath)) {
            fs.copyFileSync(routesPath, bakPath);
            success(`Respaldo creado: src/api/routes.js.bak`);
        }

        let content = fs.readFileSync(routesPath, 'utf8');

        // Ajustar: activo: 1 → activo: true
        content = content.replace(/activo:\s*1/g, 'activo: true');
        content = content.replace(/activo:\s*0/g, 'activo: false');
        content = content.replace(/\.eq\('activo',\s*1\)/g, ".eq('activo', true)");
        content = content.replace(/\.eq\('activo',\s*0\)/g, ".eq('activo', false)");
        content = content.replace(/parseInt\(activo\)/g, 'activo === "true" || activo === "1"');

        // Ajustar: color_hex → color
        content = content.replace(/color_hex/g, 'color');
        content = content.replace(/color_nombre/g, 'color');

        // Ajustar: fecha_registro → created_at en empresas
        content = content.replace(/fecha_registro:\s*now/g, 'created_at: now');

        // Ajustar: cargo (no existe en clientes de Supabase) → se omite
        content = content.replace(/cargo:\s*cargo\s*\|\|\s*''/g, '');

        // Ajustar: consultas con join de bots_config
        // Cambiar bots_config!inner a bots_config!left
        content = content.replace(/bots_config!inner/g, 'bots_config!left');

        // Ajustar: .order con columnas que no existen
        content = content.replace(/'fecha_registro'/g, "'created_at'");
        content = content.replace(/'color_nombre'/g, "'color'");

        fs.writeFileSync(routesPath, content, 'utf8');
        archivosModificados.push('src/api/routes.js');
        success('Actualizado: src/api/routes.js');
    }

    // 4c. Actualizar botManager.js
    const botPath = path.join(SRC_DIR, 'bot', 'botManager.js');
    if (fs.existsSync(botPath)) {
        const bakPath = botPath + '.bak';
        if (!fs.existsSync(bakPath)) {
            fs.copyFileSync(botPath, bakPath);
            success(`Respaldo creado: src/bot/botManager.js.bak`);
        }

        let content = fs.readFileSync(botPath, 'utf8');

        // Ajustar: activo: 1 → activo: true
        content = content.replace(/\.eq\('activo',\s*1\)/g, ".eq('activo', true)");
        content = content.replace(/activo:\s*1/g, 'activo: true');

        // Ajustar: color_hex → color
        content = content.replace(/color_hex/g, 'color');

        // Ajustar: empresa_nombre → nombre (en joins)
        content = content.replace(/nombre as empresa_nombre/g, 'nombre');

        fs.writeFileSync(botPath, content, 'utf8');
        archivosModificados.push('src/bot/botManager.js');
        success('Actualizado: src/bot/botManager.js');
    }

    return archivosModificados;
}

// ─── PASO 5: VERIFICAR CONEXIÓN ───────────────────────────────

async function paso5_verificarConexion() {
    title('PASO 5: Verificando conexión a Supabase');

    try {
        const { getSupabase } = require(path.join(DB_DIR, 'supabase.js'));
        const supabase = getSupabase();
        
        const { data, error } = await supabase.from('empresas').select('count', { count: 'exact', head: true });
        
        if (error) {
            error(`Error de conexión: ${error.message}`);
            info('Asegúrate de haber ejecutado supabase-migration.sql en el SQL Editor de Supabase');
            return false;
        }
        
        success('Conexión a Supabase exitosa');
        return true;
    } catch (err) {
        error(`Error: ${err.message}`);
        return false;
    }
}

// ─── PASO 6: SEED (opcional) ───────────────────────────────────

async function paso6_seed() {
    title('PASO 6: Insertando datos de prueba (--seed)');

    const { getSupabase } = require(path.join(DB_DIR, 'supabase.js'));
    const supabase = getSupabase();

    try {
        // 1. Crear empresa de prueba
        const { data: empresa, error: errEmp } = await supabase
            .from('empresas')
            .insert({
                nombre: 'Construcción XYZ',
                rubro: 'construccion',
                color: '#FF5733',
                activo: true,
                config_json: JSON.stringify({ notas: 'Empresa de construcción de prueba' })
            })
            .select()
            .single();

        if (errEmp) {
            error(`Error creando empresa: ${errEmp.message}`);
            return false;
        }
        success(`Empresa creada: "${empresa.nombre}" (ID: ${empresa.id})`);

        // 2. Crear configuración del bot
        const { error: errBot } = await supabase
            .from('bots_config')
            .insert({
                empresa_id: empresa.id,
                nombre_bot: '🤖 Constructor Bot',
                numero_whatsapp: '584161234567',
                plantilla: 'construccion',
                activo: true,
                estado: 'desconectado'
            });

        if (errBot) {
            warn(`Error creando bots_config: ${errBot.message}`);
        } else {
            success('Configuración de bot creada');
        }

        // 3. Crear comandos personalizados
        const comandos = [
            {
                empresa_id: empresa.id,
                comando: 'horario',
                descripcion: 'Ver horario de atención',
                tipo: 'simple',
                config: JSON.stringify({ mensaje: '🕐 *Horario de atención:*\nLunes a Viernes: 7am - 5pm\nSábados: 8am - 12pm' }),
                activo: true
            },
            {
                empresa_id: empresa.id,
                comando: 'registrar_gasto',
                descripcion: 'Registrar un nuevo gasto',
                tipo: 'formulario',
                config: JSON.stringify({ 
                    campos: [
                        { nombre: 'monto', etiqueta: '💰 ¿Cuál es el monto del gasto?' },
                        { nombre: 'categoria', etiqueta: '📂 ¿Categoría? (materiales, herramientas, transporte, otros)' }
                    ],
                    mensaje_final: '✅ *Gasto registrado exitosamente*'
                }),
                activo: true
            }
        ];

        for (const cmd of comandos) {
            const { error: errCmd } = await supabase
                .from('comandos_personalizados')
                .insert(cmd);
            
            if (errCmd) {
                warn(`Error creando comando "${cmd.comando}": ${errCmd.message}`);
            } else {
                success(`Comando creado: /${cmd.comando} (${cmd.tipo})`);
            }
        }

        // 4. Crear cliente de prueba
        const { error: errCli } = await supabase
            .from('clientes')
            .insert({
                empresa_id: empresa.id,
                nombre: 'Carlos Mendoza',
                cedula: 'V-12345678',
                telefono: '584161234568',
                email: 'carlos@construccionxyz.com'
            });

        if (errCli) {
            warn(`Error creando cliente: ${errCli.message}`);
        } else {
            success('Cliente creado: Carlos Mendoza');
        }

        // 5. Crear facturas de prueba
        const facturas = [
            { proveedor: 'Ferretería El Constructor', total: 1250.00, categoria: 'materiales' },
            { proveedor: 'Transporte Rápido', total: 350.00, categoria: 'transporte' },
            { proveedor: 'ToolShop C.A.', total: 780.50, categoria: 'herramientas' },
        ];

        for (const f of facturas) {
            const { error: errInv } = await supabase
                .from('invoices')
                .insert({
                    empresa_id: empresa.id,
                    proveedor: f.proveedor,
                    fecha: new Date().toISOString().split('T')[0],
                    total: f.total,
                    categoria: f.categoria,
                    tipo_gasto: 'variable',
                    fecha_registro: new Date().toISOString()
                });
            
            if (errInv) {
                warn(`Error creando factura "${f.proveedor}": ${errInv.message}`);
            } else {
                success(`Factura creada: ${f.proveedor} - $${f.total}`);
            }
        }

        // 6. Crear presupuesto
        const mesActual = new Date().toISOString().slice(0, 7);
        const { error: errBud } = await supabase
            .from('budgets')
            .insert({
                empresa_id: empresa.id,
                categoria: 'materiales',
                limite: 5000.00,
                mes: mesActual
            });

        if (errBud) {
            warn(`Error creando presupuesto: ${errBud.message}`);
        } else {
            success(`Presupuesto creado: materiales - $5000/mes`);
        }

        console.log(`\n${COLOR_GREEN}${COLOR_BOLD}🎉 Seed completado exitosamente!${COLOR_RESET}`);
        console.log(`\nResumen:`);
        console.log(`  🏢 Empresa: ${empresa.nombre} (ID: ${empresa.id})`);
        console.log(`  🤖 Bot: Configurado`);
        console.log(`  📋 Comandos: /horario (simple), /registrar_gasto (formulario)`);
        console.log(`  👤 Cliente: 1`);
        console.log(`  📄 Facturas: ${facturas.length}`);
        console.log(`  💰 Presupuesto: 1`);

        return true;
    } catch (err) {
        error(`Error en seed: ${err.message}`);
        return false;
    }
}

// ─── MAIN ──────────────────────────────────────────────────────

async function main() {
    console.log(`\n${COLOR_BOLD}${COLOR_CYAN}╔══════════════════════════════════════════════════╗`);
    console.log(`║     🚀 INVOICEFLOW — Migración a Supabase      ║`);
    console.log(`╚══════════════════════════════════════════════════╝${COLOR_RESET}\n`);

    const args = process.argv.slice(2);
    const withSeed = args.includes('--seed');

    // Paso 1: Instalar dependencias
    paso1_instalarDependencias();

    // Paso 2: Verificar .env
    paso2_verificarEnv();

    // Paso 3: Crear cliente Supabase
    paso3_crearClienteSupabase();

    // Paso 4: Respaldar y actualizar archivos
    const archivosModificados = paso4_respaldarYActualizar();

    // Paso 5: Verificar conexión
    const conexionOk = await paso5_verificarConexion();

    // Paso 6: Seed (opcional)
    let seedOk = false;
    if (withSeed && conexionOk) {
        seedOk = await paso6_seed();
    }

    // ─── RESUMEN FINAL ─────────────────────────────────────────
    console.log(`\n${COLOR_BOLD}${COLOR_CYAN}═══════════════════════════════════════════`);
    console.log(`  📊 RESUMEN DE MIGRACIÓN`);
    console.log(`═══════════════════════════════════════════${COLOR_RESET}\n`);

    console.log(`${COLOR_BOLD}Archivos creados:${COLOR_RESET}`);
    console.log(`  ✅ src/db/supabase.js`);

    console.log(`\n${COLOR_BOLD}Archivos modificados:${COLOR_RESET}`);
    for (const archivo of archivosModificados) {
        console.log(`  ✅ ${archivo}`);
        console.log(`     ↳ Respaldo: ${archivo}.bak`);
    }

    console.log(`\n${COLOR_BOLD}Archivos respaldados:${COLOR_RESET}`);
    for (const archivo of archivosModificados) {
        console.log(`  📁 ${archivo}.bak`);
    }

    console.log(`\n${COLOR_BOLD}Conexión a Supabase:${COLOR_RESET}`);
    console.log(`  ${conexionOk ? '✅ Exitosa' : '❌ Falló'}`);

    if (withSeed) {
        console.log(`\n${COLOR_BOLD}Seed de datos:${COLOR_RESET}`);
        console.log(`  ${seedOk ? '✅ Completado' : '❌ Falló'}`);
    }

    console.log(`\n${COLOR_BOLD}${COLOR_GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  🎉 MIGRACIÓN COMPLETADA`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLOR_RESET}\n`);

    if (!conexionOk) {
        warn('IMPORTANTE: La conexión a Supabase falló.');
        info('Asegúrate de:');
        info('  1. Ejecutar supabase-migration.sql en el SQL Editor de Supabase');
        info('  2. Verificar SUPABASE_URL y SUPABASE_KEY en bot-whatsapp/.env');
        info('  3. Que el proyecto de Supabase esté activo');
    }

    if (conexionOk && !withSeed) {
        info('Para insertar datos de prueba, ejecuta:');
        info('  node scripts/migrate-to-supabase.js --seed');
    }

    info('\nPara iniciar el servidor:');
    info('  cd bot-whatsapp && npm start');
    info('  → http://localhost:3000');
}

main().catch(err => {
    error(`Error fatal: ${err.message}`);
    process.exit(1);
});
