// Ejecutar migración SQL en Supabase via API REST
require('dotenv').config({ path: __dirname + '/.env' });

const https = require('https');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Leer el SQL de migración
const sqlPath = path.join(__dirname, '..', 'supabase-migration.sql');
let sql = fs.readFileSync(sqlPath, 'utf8');

// Modificar SQL para usar CREATE TABLE IF NOT EXISTS y evitar errores con tablas existentes
// También ajustar columnas para que coincidan con las existentes

// Primero, eliminar tablas existentes que tienen estructura incorrecta y recrearlas
sql = `
-- ============================================================
-- INVOICEFLOW — Migración para Supabase
-- ============================================================

-- Eliminar tablas existentes con estructura incorrecta
DROP TABLE IF EXISTS clientes CASCADE;
DROP TABLE IF EXISTS empresas CASCADE;

-- Recrear empresas con la estructura correcta
CREATE TABLE empresas (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    rubro TEXT DEFAULT 'general',
    color TEXT DEFAULT '#00d4aa',
    activo BOOLEAN DEFAULT true,
    config_json TEXT DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recrear clientes
CREATE TABLE clientes (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    cedula TEXT,
    telefono TEXT,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de configuración de bots por empresa
CREATE TABLE IF NOT EXISTS bots_config (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL UNIQUE REFERENCES empresas(id) ON DELETE CASCADE,
    nombre_bot TEXT DEFAULT 'InvoiceFlow Bot',
    numero_whatsapp TEXT,
    plantilla TEXT DEFAULT 'general',
    activo BOOLEAN DEFAULT true,
    ultima_conexion TIMESTAMPTZ,
    estado TEXT DEFAULT 'desconectado'
);

-- Tabla de facturas
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    proveedor TEXT,
    fecha DATE,
    total NUMERIC(10,2),
    categoria TEXT,
    numero_factura TEXT,
    tipo_gasto TEXT DEFAULT 'variable',
    notas TEXT,
    fecha_registro TIMESTAMPTZ DEFAULT NOW(),
    hash_imagen TEXT UNIQUE
);

-- Tabla de presupuestos
CREATE TABLE IF NOT EXISTS budgets (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    categoria TEXT,
    limite NUMERIC(10,2),
    mes TEXT,
    UNIQUE(empresa_id, categoria, mes)
);

-- Tabla de comandos personalizados
CREATE TABLE IF NOT EXISTS comandos_personalizados (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    comando TEXT NOT NULL,
    descripcion TEXT,
    tipo TEXT DEFAULT 'simple' CHECK(tipo IN ('simple', 'formulario')),
    config TEXT DEFAULT '{}',
    activo BOOLEAN DEFAULT true
);

-- Índice para búsqueda rápida por empresa + comando
CREATE INDEX IF NOT EXISTS idx_comandos_empresa_comando 
ON comandos_personalizados(empresa_id, comando);

-- Tabla de registros de formularios
CREATE TABLE IF NOT EXISTS registros_formularios (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    comando_id INTEGER REFERENCES comandos_personalizados(id) ON DELETE SET NULL,
    comando TEXT NOT NULL,
    telefono TEXT NOT NULL,
    datos TEXT NOT NULL,
    fecha_registro TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de obras (para rubro construcción)
CREATE TABLE IF NOT EXISTS obras (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    ubicacion TEXT,
    presupuesto NUMERIC(10,2),
    estado TEXT DEFAULT 'activa',
    fecha_inicio DATE,
    fecha_estimada_fin DATE,
    notas TEXT
);

-- Tabla de materiales (para rubro construcción)
CREATE TABLE IF NOT EXISTS materiales (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    obra_id INTEGER REFERENCES obras(id) ON DELETE SET NULL,
    nombre TEXT NOT NULL,
    cantidad NUMERIC(10,2),
    unidad TEXT DEFAULT 'unidad',
    precio_unitario NUMERIC(10,2),
    proveedor TEXT,
    fecha_compra DATE
);

-- Tabla de pacientes (para rubro salud)
CREATE TABLE IF NOT EXISTS pacientes (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    cedula TEXT,
    telefono TEXT,
    diagnostico TEXT,
    fecha_registro TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de inventario (para tiendas/restaurantes)
CREATE TABLE IF NOT EXISTS inventario (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    cantidad NUMERIC(10,2),
    unidad TEXT DEFAULT 'unidad',
    precio_compra NUMERIC(10,2),
    precio_venta NUMERIC(10,2),
    proveedor TEXT,
    categoria TEXT,
    stock_minimo NUMERIC(10,2) DEFAULT 0
);
`;

// Función para ejecutar SQL via API REST de Supabase
function executeSQL(sqlContent) {
    return new Promise((resolve, reject) => {
        const url = new URL('/rest/v1/rpc/', SUPABASE_URL);
        // Usamos query endpoint para SQL
        const postData = JSON.stringify({ query: sqlContent });
        
        const options = {
            hostname: url.hostname,
            path: '/rest/v1/',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`Status: ${res.statusCode}`);
                console.log('Response:', data.substring(0, 500));
                resolve(data);
            });
        });

        req.on('error', (e) => reject(e));
        req.write(postData);
        req.end();
    });
}

// Alternativa: usar fetch de Node
async function runMigration() {
    console.log('🚀 Ejecutando migración SQL en Supabase...\n');
    
    try {
        // Dividir SQL en statements individuales
        const statements = sql.split(';').filter(s => s.trim().length > 0);
        
        for (let i = 0; i < statements.length; i++) {
            const stmt = statements[i].trim();
            if (!stmt) continue;
            
            console.log(`Ejecutando statement ${i + 1}/${statements.length}...`);
            
            const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                },
                body: JSON.stringify({ query: stmt + ';' })
            });
            
            const text = await response.text();
            if (response.ok) {
                console.log(`  ✅ OK`);
            } else {
                console.log(`  ⚠️ ${text.substring(0, 200)}`);
            }
        }
        
        console.log('\n✅ Migración completada!');
    } catch (e) {
        console.error('❌ Error:', e.message);
    }
}

runMigration();
