/**
 * INVOICEFLOW — Módulo de Base de Datos Supabase (PostgreSQL)
 * 
 * Reemplaza la base de datos SQLite local.
 * Usa @supabase/supabase-js para conectarse a Supabase.
 * 
 * Configuración en: bot-whatsapp/.env
 *   SUPABASE_URL=https://tu-proyecto.supabase.co
 *   SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 * 
 * Migración SQL en: supabase-migration.sql
 *   Pega ese SQL en el SQL Editor de Supabase para crear las tablas.
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// Cargar variables de entorno
require('dotenv').config({ path: path.join(__dirname, '..', '..', 'bot-whatsapp', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');

// Asegurar que el directorio de uploads existe
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

let supabase = null;

/**
 * Obtiene la instancia del cliente Supabase (singleton)
 */
function getDb() {
    if (!supabase) {
        if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_URL.includes('tu-proyecto')) {
            console.error('❌ ERROR: Debes configurar SUPABASE_URL y SUPABASE_KEY en bot-whatsapp/.env');
            console.error('  1. Crea un proyecto en https://supabase.com');
            console.error('  2. Ve a Project Settings > API');
            console.error('  3. Copia la URL y anon/public key al archivo .env');
            console.error('  4. Pega el contenido de supabase-migration.sql en el SQL Editor');
            process.exit(1);
        }
        supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return supabase;
}

/**
 * Inicializa la conexión (verifica que funcione)
 */
async function initDb() {
    try {
        const client = getDb();
        // Verificar conexión consultando la tabla empresas
        const { data, error } = await client.from('empresas').select('count', { count: 'exact', head: true });
        if (error) {
            console.error('❌ Error de conexión a Supabase:', error.message);
            console.error('   Asegúrate de haber ejecutado la migración SQL en el SQL Editor de Supabase.');
            process.exit(1);
        }
        console.log('✅ Base de datos Supabase conectada');
    } catch (err) {
        console.error('❌ Error al conectar con Supabase:', err.message);
        process.exit(1);
    }
}

// ─── HELPERS ──────────────────────────────────────────────────

/**
 * Convierte una fila de Supabase a objeto plano
 */
function rowToObj(row) {
    if (!row) return null;
    return { ...row };
}

/**
 * Convierte un array de filas a objetos planos
 */
function rowsToArray(rows) {
    if (!rows) return [];
    return rows.map(row => ({ ...row }));
}

/**
 * Obtiene una empresa por ID, lanza error si no existe o está inactiva
 */
async function obtenerEmpresaOError(empresaId) {
    const client = getDb();
    const { data, error } = await client
        .from('empresas')
        .select('*')
        .eq('id', empresaId)
        .eq('activo', true)
        .single();

    if (error || !data) {
        const err = new Error('Empresa no encontrada o inactiva');
        err.statusCode = 404;
        throw err;
    }
    return rowToObj(data);
}

// ─── COLORES Y PLANTILLAS ────────────────────────────────────

const COLORES_EMPRESA = [
    { nombre: "Verde Menta", hex: "#00d4aa" },
    { nombre: "Púrpura", hex: "#7c3aed" },
    { nombre: "Azul", hex: "#3b82f6" },
    { nombre: "Ámbar", hex: "#f59e0b" },
    { nombre: "Rosa", hex: "#ec4899" },
    { nombre: "Rojo", hex: "#ef4444" },
    { nombre: "Cian", hex: "#06b6d4" },
    { nombre: "Naranja", hex: "#f97316" },
    { nombre: "Verde Lima", hex: "#84cc16" },
    { nombre: "Índigo", hex: "#6366f1" },
];

const PLANTILLAS_BOT = {
    general: {
        nombre: "General",
        icono: "🏢",
        comandos: ["gastos", "facturas", "presupuesto", "alertas", "web", "foto"],
        descripcion: "Gestión financiera genérica"
    },
    construccion: {
        nombre: "Construcción",
        icono: "🏗️",
        comandos: ["registrar material", "registrar obra", "ver obras", "gastos de obra", "presupuesto obra", "materiales", "facturas", "alertas"],
        descripcion: "Control de obras, materiales y gastos de construcción"
    },
    tienda: {
        nombre: "Tienda / Comercio",
        icono: "🏪",
        comandos: ["registrar venta", "registrar compra", "inventario", "gastos del día", "proveedores", "facturas", "alertas"],
        descripcion: "Ventas, compras e inventario"
    },
    salud: {
        nombre: "Clínica / Salud",
        icono: "🏥",
        comandos: ["registrar paciente", "registrar insumo", "citas hoy", "gastos médicos", "facturas", "alertas"],
        descripcion: "Gestión de pacientes, insumos y citas"
    },
    logistica: {
        nombre: "Logística",
        icono: "📦",
        comandos: ["registrar envío", "rastrear pedido", "gastos de ruta", "vehículos", "facturas", "alertas"],
        descripcion: "Envíos, rutas y gastos de logística"
    },
    restaurante: {
        nombre: "Restaurante",
        icono: "🍽️",
        comandos: ["registrar venta", "inventario cocina", "gastos del día", "proveedores", "facturas", "alertas"],
        descripcion: "Ventas, inventario de cocina y proveedores"
    }
};

module.exports = {
    getDb,
    initDb,
    rowToObj,
    rowsToArray,
    obtenerEmpresaOError,
    COLORES_EMPRESA,
    PLANTILLAS_BOT,
    UPLOAD_DIR
};
