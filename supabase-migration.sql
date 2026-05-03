-- ============================================================
-- INVOICEFLOW — Migración Completa para Supabase SQL Editor
-- ============================================================
-- Pega TODO este SQL en el SQL Editor de Supabase y ejecútalo.
-- Crea todas las tablas necesarias para el bot de WhatsApp.
-- ============================================================

-- Eliminar tablas existentes (en orden inverso por las FK)
DROP TABLE IF EXISTS registros_formularios CASCADE;
DROP TABLE IF EXISTS comandos_personalizados CASCADE;
DROP TABLE IF EXISTS materiales CASCADE;
DROP TABLE IF EXISTS obras CASCADE;
DROP TABLE IF EXISTS pacientes CASCADE;
DROP TABLE IF EXISTS inventario CASCADE;
DROP TABLE IF EXISTS budgets CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS bots_config CASCADE;
DROP TABLE IF EXISTS clientes CASCADE;
DROP TABLE IF EXISTS empresas CASCADE;

-- ============================================================
-- 1. EMPRESAS
-- ============================================================
CREATE TABLE empresas (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    rubro TEXT DEFAULT 'general',
    color TEXT DEFAULT '#00d4aa',
    activo BOOLEAN DEFAULT true,
    config_json TEXT DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. CLIENTES
-- ============================================================
CREATE TABLE clientes (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    cedula TEXT,
    telefono TEXT,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. CONFIGURACIÓN DE BOTS
-- ============================================================
CREATE TABLE bots_config (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL UNIQUE REFERENCES empresas(id) ON DELETE CASCADE,
    nombre_bot TEXT DEFAULT 'InvoiceFlow Bot',
    numero_whatsapp TEXT,
    plantilla TEXT DEFAULT 'general',
    activo BOOLEAN DEFAULT true,
    ultima_conexion TIMESTAMPTZ,
    estado TEXT DEFAULT 'desconectado'
);

-- ============================================================
-- 4. FACTURAS (INVOICES)
-- ============================================================
CREATE TABLE invoices (
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

-- ============================================================
-- 5. PRESUPUESTOS (BUDGETS)
-- ============================================================
CREATE TABLE budgets (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    categoria TEXT,
    limite NUMERIC(10,2),
    mes TEXT,
    UNIQUE(empresa_id, categoria, mes)
);

-- ============================================================
-- 6. COMANDOS PERSONALIZADOS
-- ============================================================
CREATE TABLE comandos_personalizados (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    comando TEXT NOT NULL,
    descripcion TEXT,
    tipo TEXT DEFAULT 'simple' CHECK(tipo IN ('simple', 'formulario')),
    config TEXT DEFAULT '{}',
    activo BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_comandos_empresa_comando 
ON comandos_personalizados(empresa_id, comando);

-- ============================================================
-- 7. REGISTROS DE FORMULARIOS
-- ============================================================
CREATE TABLE registros_formularios (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    comando_id INTEGER REFERENCES comandos_personalizados(id) ON DELETE SET NULL,
    comando TEXT NOT NULL,
    telefono TEXT NOT NULL,
    datos TEXT NOT NULL,
    fecha_registro TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. OBRAS (para rubro construcción)
-- ============================================================
CREATE TABLE obras (
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

-- ============================================================
-- 9. MATERIALES (para rubro construcción)
-- ============================================================
CREATE TABLE materiales (
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

-- ============================================================
-- 10. PACIENTES (para rubro salud)
-- ============================================================
CREATE TABLE pacientes (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    cedula TEXT,
    telefono TEXT,
    diagnostico TEXT,
    fecha_registro TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 11. INVENTARIO (para tiendas/restaurantes)
-- ============================================================
CREATE TABLE inventario (
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

-- ============================================================
--  FIN DE LA MIGRACIÓN
-- ============================================================
