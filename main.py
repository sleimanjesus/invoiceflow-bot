"""
INVOICEFLOW SaaS — Sistema Multi-Empresa de Facturación Inteligente
Backend: FastAPI + SQLite + DeepSeek Vision
FASE 1: Base de datos multi-empresa + Panel Admin + Bot multi-cliente
"""

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
import base64
import uvicorn
import sqlite3
import json
import os
import re
from datetime import datetime, date
import hashlib
import random

# ─── Configuración ───
app = FastAPI(title="InvoiceFlow SaaS", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
BASE_DIR = os.path.dirname(__file__)

DB_PATH = os.path.join(BASE_DIR, "data", "invoiceflow.db")
UPLOAD_DIR = os.path.join(BASE_DIR, "data", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ─── Colores para empresas ───
COLORES_EMPRESA = [
    {"nombre": "Verde Menta", "hex": "#00d4aa"},
    {"nombre": "Púrpura", "hex": "#7c3aed"},
    {"nombre": "Azul", "hex": "#3b82f6"},
    {"nombre": "Ámbar", "hex": "#f59e0b"},
    {"nombre": "Rosa", "hex": "#ec4899"},
    {"nombre": "Rojo", "hex": "#ef4444"},
    {"nombre": "Cian", "hex": "#06b6d4"},
    {"nombre": "Naranja", "hex": "#f97316"},
    {"nombre": "Verde Lima", "hex": "#84cc16"},
    {"nombre": "Índigo", "hex": "#6366f1"},
]

# ─── Rubros / Plantillas de Bot ───
PLANTILLAS_BOT = {
    "general": {
        "nombre": "General",
        "icono": "🏢",
        "comandos": ["gastos", "facturas", "presupuesto", "alertas", "web", "foto"],
        "descripcion": "Gestión financiera genérica"
    },
    "construccion": {
        "nombre": "Construcción",
        "icono": "🏗️",
        "comandos": ["registrar material", "registrar obra", "ver obras", "gastos de obra", "presupuesto obra", "materiales", "facturas", "alertas"],
        "descripcion": "Control de obras, materiales y gastos de construcción"
    },
    "tienda": {
        "nombre": "Tienda / Comercio",
        "icono": "🏪",
        "comandos": ["registrar venta", "registrar compra", "inventario", "gastos del día", "proveedores", "facturas", "alertas"],
        "descripcion": "Ventas, compras e inventario"
    },
    "salud": {
        "nombre": "Clínica / Salud",
        "icono": "🏥",
        "comandos": ["registrar paciente", "registrar insumo", "citas hoy", "gastos médicos", "facturas", "alertas"],
        "descripcion": "Gestión de pacientes, insumos y citas"
    },
    "logistica": {
        "nombre": "Logística",
        "icono": "📦",
        "comandos": ["registrar envío", "rastrear pedido", "gastos de ruta", "vehículos", "facturas", "alertas"],
        "descripcion": "Envíos, rutas y gastos de logística"
    },
    "restaurante": {
        "nombre": "Restaurante",
        "icono": "🍽️",
        "comandos": ["registrar venta", "inventario cocina", "gastos del día", "proveedores", "facturas", "alertas"],
        "descripcion": "Ventas, inventario de cocina y proveedores"
    }
}

# ─── Base de Datos ───
def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Tabla de empresas
    c.execute("""
        CREATE TABLE IF NOT EXISTS empresas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            rubro TEXT DEFAULT 'general',
            color_hex TEXT DEFAULT '#00d4aa',
            color_nombre TEXT DEFAULT 'Verde Menta',
            activo INTEGER DEFAULT 1,
            fecha_registro TEXT,
            notas TEXT
        )
    """)
    
    # Tabla de clientes (contactos dentro de cada empresa)
    c.execute("""
        CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            empresa_id INTEGER NOT NULL,
            nombre TEXT NOT NULL,
            cedula TEXT,
            telefono TEXT NOT NULL,
            email TEXT,
            cargo TEXT,
            activo INTEGER DEFAULT 1,
            fecha_registro TEXT,
            FOREIGN KEY (empresa_id) REFERENCES empresas(id)
        )
    """)
    
    # Tabla de configuración de bots por empresa
    c.execute("""
        CREATE TABLE IF NOT EXISTS bots_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            empresa_id INTEGER NOT NULL UNIQUE,
            nombre_bot TEXT DEFAULT 'InvoiceFlow Bot',
            numero_whatsapp TEXT,
            plantilla TEXT DEFAULT 'general',
            activo INTEGER DEFAULT 1,
            ultima_conexion TEXT,
            estado TEXT DEFAULT 'desconectado',
            FOREIGN KEY (empresa_id) REFERENCES empresas(id)
        )
    """)
    
    # Tabla de facturas (ahora con empresa_id)
    c.execute("""
        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            empresa_id INTEGER NOT NULL,
            cliente_id INTEGER,
            proveedor TEXT,
            fecha TEXT,
            total REAL,
            categoria TEXT,
            numero_factura TEXT,
            tipo_gasto TEXT DEFAULT 'variable',
            notas TEXT,
            fecha_registro TEXT,
            hash_imagen TEXT UNIQUE,
            FOREIGN KEY (empresa_id) REFERENCES empresas(id),
            FOREIGN KEY (cliente_id) REFERENCES clientes(id)
        )
    """)
    
    # Tabla de presupuestos (ahora con empresa_id)
    c.execute("""
        CREATE TABLE IF NOT EXISTS budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            empresa_id INTEGER NOT NULL,
            categoria TEXT,
            limite REAL,
            mes TEXT,
            UNIQUE(empresa_id, categoria, mes),
            FOREIGN KEY (empresa_id) REFERENCES empresas(id)
        )
    """)
    
    # Tabla de obras (para rubro construcción)
    c.execute("""
        CREATE TABLE IF NOT EXISTS obras (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            empresa_id INTEGER NOT NULL,
            nombre TEXT NOT NULL,
            ubicacion TEXT,
            presupuesto REAL,
            estado TEXT DEFAULT 'activa',
            fecha_inicio TEXT,
            fecha_estimada_fin TEXT,
            notas TEXT,
            FOREIGN KEY (empresa_id) REFERENCES empresas(id)
        )
    """)
    
    # Tabla de materiales (para rubro construcción)
    c.execute("""
        CREATE TABLE IF NOT EXISTS materiales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            empresa_id INTEGER NOT NULL,
            obra_id INTEGER,
            nombre TEXT NOT NULL,
            cantidad REAL,
            unidad TEXT DEFAULT 'unidad',
            precio_unitario REAL,
            proveedor TEXT,
            fecha_compra TEXT,
            FOREIGN KEY (empresa_id) REFERENCES empresas(id),
            FOREIGN KEY (obra_id) REFERENCES obras(id)
        )
    """)
    
    # Tabla de pacientes (para rubro salud)
    c.execute("""
        CREATE TABLE IF NOT EXISTS pacientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            empresa_id INTEGER NOT NULL,
            nombre TEXT NOT NULL,
            cedula TEXT,
            telefono TEXT,
            diagnostico TEXT,
            fecha_registro TEXT,
            FOREIGN KEY (empresa_id) REFERENCES empresas(id)
        )
    """)
    
    # Tabla de inventario (para tiendas/restaurantes)
    c.execute("""
        CREATE TABLE IF NOT EXISTS inventario (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            empresa_id INTEGER NOT NULL,
            nombre TEXT NOT NULL,
            cantidad REAL,
            unidad TEXT DEFAULT 'unidad',
            precio_compra REAL,
            precio_venta REAL,
            proveedor TEXT,
            categoria TEXT,
            stock_minimo REAL DEFAULT 0,
            FOREIGN KEY (empresa_id) REFERENCES empresas(id)
        )
    """)
    
    # Tabla de comandos personalizados (comandos configurables por empresa)
    c.execute("""
        CREATE TABLE IF NOT EXISTS comandos_personalizados (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            empresa_id INTEGER NOT NULL,
            comando TEXT NOT NULL,
            descripcion TEXT,
            tipo TEXT DEFAULT 'simple' CHECK(tipo IN ('simple', 'formulario')),
            config TEXT DEFAULT '{}',
            activo INTEGER DEFAULT 1,
            FOREIGN KEY (empresa_id) REFERENCES empresas(id)
        )
    """)
    
    # Índice para búsqueda rápida por empresa + comando
    c.execute("""
        CREATE INDEX IF NOT EXISTS idx_comandos_empresa_comando 
        ON comandos_personalizados(empresa_id, comando)
    """)
    
    # Tabla de registros de formularios (datos recopilados por comandos tipo 'formulario')
    c.execute("""
        CREATE TABLE IF NOT EXISTS registros_formularios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            empresa_id INTEGER NOT NULL,
            comando_id INTEGER,
            comando TEXT NOT NULL,
            telefono TEXT NOT NULL,
            datos TEXT NOT NULL,
            fecha_registro TEXT,
            FOREIGN KEY (empresa_id) REFERENCES empresas(id),
            FOREIGN KEY (comando_id) REFERENCES comandos_personalizados(id)
        )
    """)
    
    conn.commit()
    conn.close()

init_db()

# ─── Helpers ───
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def calcular_hash(contenido: bytes) -> str:
    return hashlib.md5(contenido).hexdigest()

def obtener_empresa_o_error(empresa_id: int):
    """Verifica que la empresa exista y esté activa"""
    conn = get_db()
    cursor = conn.execute("SELECT * FROM empresas WHERE id = ? AND activo = 1", (empresa_id,))
    empresa = dict(cursor.fetchone()) if cursor.fetchone() else None
    conn.close()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada o inactiva")
    return empresa

def extraer_factura_simulada(filename: str) -> dict:
    """Simula la extracción de datos (reemplazar con DeepSeek Vision)"""
    proveedores = ["Distribuidora Los Andes", "Farmacia San José", "Comercial El Sol", 
                   "Inversiones 2000", "Distribuidora Polar", "Mercado Municipal",
                   "Ferremateriales El Constructor", "Clínica Dental Care"]
    categorias = ["Alimentos", "Salud", "Oficina", "Servicios", "Transporte", "Tecnología",
                  "Materiales Construcción", "Insumos Médicos"]
    
    return {
        "proveedor": random.choice(proveedores),
        "fecha": date.today().isoformat(),
        "total": round(random.uniform(10, 500), 2),
        "categoria": random.choice(categorias),
        "numero_factura": f"F-{random.randint(1000, 9999)}",
        "tipo_gasto": random.choice(["fijo", "variable"])
    }

def analizar_gasto(datos: dict, empresa_id: int) -> dict:
    """Analiza el gasto y devuelve insights"""
    conn = get_db()
    
    mes_actual = datetime.now().strftime("%Y-%m")
    cursor = conn.execute("""
        SELECT COUNT(*) as total, SUM(total) as suma 
        FROM invoices 
        WHERE empresa_id = ? AND strftime('%Y-%m', fecha) = ?
    """, (empresa_id, mes_actual))
    resumen_mes = dict(cursor.fetchone())
    
    cursor = conn.execute("""
        SELECT COUNT(*) as count FROM invoices 
        WHERE empresa_id = ? AND proveedor = ? AND id != (SELECT MAX(id) FROM invoices WHERE empresa_id = ?)
    """, (empresa_id, datos["proveedor"], empresa_id))
    gastos_previos = dict(cursor.fetchone())
    
    cursor = conn.execute("""
        SELECT COUNT(*) as count FROM invoices 
        WHERE empresa_id = ? AND total = ? AND proveedor = ? AND id != (SELECT MAX(id) FROM invoices WHERE empresa_id = ?)
    """, (empresa_id, datos["total"], datos["proveedor"], empresa_id))
    duplicados = dict(cursor.fetchone())
    
    conn.close()
    
    insights = []
    if duplicados["count"] > 0:
        insights.append("⚠️ Posible gasto duplicado con este proveedor")
    if gastos_previos["count"] > 2:
        insights.append(f"📊 Gastas seguido en {datos['proveedor']} ({gastos_previos['count']} veces)")
    if datos["total"] > 200:
        insights.append("💰 Gasto alto detectado")
    
    return {
        "gastos_mes": resumen_mes["total"] or 0,
        "total_mes": round(resumen_mes["suma"] or 0, 2),
        "insights": insights
    }

def procesar_y_guardar_factura(contenido: bytes, empresa_id: int) -> dict:
    """Procesa una imagen de factura y la guarda en la BD"""
    hash_img = calcular_hash(contenido)
    
    filename = f"{hash_img}.jpg"
    filepath = os.path.join(UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(contenido)
    
    datos = extraer_factura_simulada(filename)
    
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO invoices (empresa_id, proveedor, fecha, total, categoria, numero_factura, tipo_gasto, fecha_registro, hash_imagen)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            empresa_id,
            datos["proveedor"],
            datos["fecha"],
            datos["total"],
            datos["categoria"],
            datos["numero_factura"],
            datos["tipo_gasto"],
            datetime.now().isoformat(),
            hash_img
        ))
        conn.commit()
        
        analisis = analizar_gasto(datos, empresa_id)
        
        return {
            "status": "ok",
            "mensaje": f"✅ Factura de {datos['proveedor']} registrada",
            "datos": datos,
            "analisis": analisis
        }
    except sqlite3.IntegrityError:
        return {
            "status": "duplicado",
            "mensaje": "⚠️ Esta factura ya fue registrada anteriormente"
        }
    finally:
        conn.close()

# ═══════════════════════════════════════════════════════════
#  ENDPOINTS PÚBLICOS
# ═══════════════════════════════════════════════════════════

@app.get("/health")
async def health_check():
    return JSONResponse({
        "status": "ok",
        "version": "2.0.0",
        "timestamp": datetime.now().isoformat()
    })

@app.get("/", response_class=HTMLResponse)
async def dashboard(empresa_id: int = None):
    html_path = os.path.join(BASE_DIR, "templates", "dashboard.html")
    with open(html_path, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

@app.get("/admin", response_class=HTMLResponse)
async def admin_panel():
    html_path = os.path.join(BASE_DIR, "templates", "admin.html")
    with open(html_path, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

@app.get("/empresa/{empresa_id}", response_class=HTMLResponse)
async def empresa_dashboard(empresa_id: int):
    """Dashboard específico de una empresa"""
    obtener_empresa_o_error(empresa_id)
    html_path = os.path.join(BASE_DIR, "templates", "dashboard.html")
    with open(html_path, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

# ═══════════════════════════════════════════════════════════
#  ENDPOINTS DE ADMINISTRACIÓN (EMPRESAS)
# ═══════════════════════════════════════════════════════════

@app.get("/api/admin/empresas")
async def listar_empresas(
    rubro: str = None,
    activo: int = None,
    search: str = None,
    orden: str = "nombre"
):
    """Lista todas las empresas con filtros y ordenamiento"""
    conn = get_db()
    
    query = "SELECT e.*, bc.nombre_bot, bc.estado as bot_estado, bc.ultima_conexion FROM empresas e LEFT JOIN bots_config bc ON e.id = bc.empresa_id WHERE 1=1"
    params = []
    
    if rubro:
        query += " AND e.rubro = ?"
        params.append(rubro)
    if activo is not None:
        query += " AND e.activo = ?"
        params.append(activo)
    if search:
        query += " AND (e.nombre LIKE ? OR e.notas LIKE ?)"
        params.append(f"%{search}%")
        params.append(f"%{search}%")
    
    # Ordenamiento
    ordenes_validas = {
        "nombre": "e.nombre ASC",
        "nombre_desc": "e.nombre DESC",
        "rubro": "e.rubro ASC",
        "fecha": "e.fecha_registro DESC",
        "fecha_asc": "e.fecha_registro ASC",
        "color": "e.color_nombre ASC"
    }
    query += f" ORDER BY {ordenes_validas.get(orden, 'e.nombre ASC')}"
    
    cursor = conn.execute(query, params)
    empresas = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return JSONResponse({
        "total": len(empresas),
        "empresas": empresas
    })

@app.get("/api/admin/empresas/{empresa_id}")
async def obtener_empresa(empresa_id: int):
    """Obtiene una empresa con todos sus detalles"""
    conn = get_db()
    cursor = conn.execute("""
        SELECT e.*, bc.nombre_bot, bc.numero_whatsapp, bc.plantilla, bc.estado as bot_estado, bc.ultima_conexion
        FROM empresas e 
        LEFT JOIN bots_config bc ON e.id = bc.empresa_id 
        WHERE e.id = ?
    """, (empresa_id,))
    empresa = dict(cursor.fetchone()) if cursor.fetchone() else None
    if not empresa:
        conn.close()
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    
    # Obtener clientes de esta empresa
    cursor = conn.execute("SELECT * FROM clientes WHERE empresa_id = ? ORDER BY nombre ASC", (empresa_id,))
    empresa["clientes"] = [dict(row) for row in cursor.fetchall()]
    
    # Obtener estadísticas
    cursor = conn.execute("SELECT COUNT(*) as total, SUM(total) as suma FROM invoices WHERE empresa_id = ?", (empresa_id,))
    stats = dict(cursor.fetchone())
    empresa["stats"] = {
        "total_facturas": stats["total"],
        "total_gastado": round(stats["suma"] or 0, 2)
    }
    
    conn.close()
    return JSONResponse(empresa)

@app.post("/api/admin/empresas")
async def crear_empresa(data: dict):
    """Crea una nueva empresa con su configuración de bot"""
    nombre = data.get("nombre", "").strip()
    rubro = data.get("rubro", "general")
    color_idx = data.get("color_idx", 0)
    notas = data.get("notas", "")
    
    if not nombre:
        return JSONResponse({"status": "error", "mensaje": "El nombre de la empresa es requerido"}, status_code=400)
    
    # Validar rubro
    if rubro not in PLANTILLAS_BOT:
        rubro = "general"
    
    # Asignar color
    color = COLORES_EMPRESA[color_idx % len(COLORES_EMPRESA)]
    
    conn = get_db()
    try:
        # Crear empresa
        cursor = conn.execute("""
            INSERT INTO empresas (nombre, rubro, color_hex, color_nombre, activo, fecha_registro, notas)
            VALUES (?, ?, ?, ?, 1, ?, ?)
        """, (nombre, rubro, color["hex"], color["nombre"], datetime.now().isoformat(), notas))
        empresa_id = cursor.lastrowid
        
        # Crear configuración de bot por defecto
        plantilla = PLANTILLAS_BOT[rubro]
        nombre_bot = data.get("nombre_bot", f"{plantilla['icono']} {nombre} Bot")
        conn.execute("""
            INSERT INTO bots_config (empresa_id, nombre_bot, plantilla, activo, estado)
            VALUES (?, ?, ?, 1, 'pendiente')
        """, (empresa_id, nombre_bot, rubro))
        
        conn.commit()
        
        return JSONResponse({
            "status": "ok",
            "mensaje": f"✅ Empresa '{nombre}' creada exitosamente",
            "empresa_id": empresa_id,
            "color": color,
            "plantilla": plantilla
        })
    except Exception as e:
        conn.rollback()
        return JSONResponse({"status": "error", "mensaje": f"Error al crear empresa: {str(e)}"}, status_code=500)
    finally:
        conn.close()

@app.put("/api/admin/empresas/{empresa_id}")
async def actualizar_empresa(empresa_id: int, data: dict):
    """Actualiza datos de una empresa"""
    conn = get_db()
    
    campos = []
    params = []
    
    for campo in ["nombre", "rubro", "color_hex", "color_nombre", "activo", "notas"]:
        if campo in data:
            campos.append(f"{campo} = ?")
            params.append(data[campo])
    
    if not campos:
        conn.close()
        return JSONResponse({"status": "error", "mensaje": "No hay campos para actualizar"})
    
    params.append(empresa_id)
    conn.execute(f"UPDATE empresas SET {', '.join(campos)} WHERE id = ?", params)
    
    # Actualizar nombre del bot si viene
    if "nombre_bot" in data:
        conn.execute("UPDATE bots_config SET nombre_bot = ? WHERE empresa_id = ?", (data["nombre_bot"], empresa_id))
    
    # Actualizar plantilla si viene
    if "plantilla" in data and data["plantilla"] in PLANTILLAS_BOT:
        conn.execute("UPDATE bots_config SET plantilla = ? WHERE empresa_id = ?", (data["plantilla"], empresa_id))
    
    conn.commit()
    conn.close()
    
    return JSONResponse({"status": "ok", "mensaje": "✅ Empresa actualizada"})

@app.delete("/api/admin/empresas/{empresa_id}")
async def eliminar_empresa(empresa_id: int):
    """Elimina una empresa y todos sus datos"""
    conn = get_db()
    conn.execute("DELETE FROM invoices WHERE empresa_id = ?", (empresa_id,))
    conn.execute("DELETE FROM budgets WHERE empresa_id = ?", (empresa_id,))
    conn.execute("DELETE FROM clientes WHERE empresa_id = ?", (empresa_id,))
    conn.execute("DELETE FROM obras WHERE empresa_id = ?", (empresa_id,))
    conn.execute("DELETE FROM materiales WHERE empresa_id = ?", (empresa_id,))
    conn.execute("DELETE FROM pacientes WHERE empresa_id = ?", (empresa_id,))
    conn.execute("DELETE FROM inventario WHERE empresa_id = ?", (empresa_id,))
    conn.execute("DELETE FROM bots_config WHERE empresa_id = ?", (empresa_id,))
    conn.execute("DELETE FROM empresas WHERE id = ?", (empresa_id,))
    conn.commit()
    conn.close()
    return JSONResponse({"status": "ok", "mensaje": "🗑️ Empresa y todos sus datos eliminados"})

# ═══════════════════════════════════════════════════════════
#  ENDPOINTS DE CLIENTES
# ═══════════════════════════════════════════════════════════

@app.get("/api/admin/empresas/{empresa_id}/clientes")
async def listar_clientes(empresa_id: int):
    """Lista los clientes de una empresa"""
    conn = get_db()
    cursor = conn.execute("SELECT * FROM clientes WHERE empresa_id = ? ORDER BY nombre ASC", (empresa_id,))
    clientes = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return JSONResponse(clientes)

@app.post("/api/admin/empresas/{empresa_id}/clientes")
async def crear_cliente(empresa_id: int, data: dict):
    """Crea un nuevo cliente para una empresa"""
    nombre = data.get("nombre", "").strip()
    if not nombre:
        return JSONResponse({"status": "error", "mensaje": "El nombre es requerido"}, status_code=400)
    
    conn = get_db()
    conn.execute("""
        INSERT INTO clientes (empresa_id, nombre, cedula, telefono, email, cargo, fecha_registro)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        empresa_id,
        nombre,
        data.get("cedula", ""),
        data.get("telefono", ""),
        data.get("email", ""),
        data.get("cargo", ""),
        datetime.now().isoformat()
    ))
    conn.commit()
    conn.close()
    return JSONResponse({"status": "ok", "mensaje": f"✅ Cliente '{nombre}' agregado"})

@app.put("/api/admin/clientes/{cliente_id}")
async def actualizar_cliente(cliente_id: int, data: dict):
    """Actualiza un cliente"""
    conn = get_db()
    campos = []
    params = []
    
    for campo in ["nombre", "cedula", "telefono", "email", "cargo", "activo"]:
        if campo in data:
            campos.append(f"{campo} = ?")
            params.append(data[campo])
    
    if not campos:
        conn.close()
        return JSONResponse({"status": "error", "mensaje": "No hay campos para actualizar"})
    
    params.append(cliente_id)
    conn.execute(f"UPDATE clientes SET {', '.join(campos)} WHERE id = ?", params)
    conn.commit()
    conn.close()
    return JSONResponse({"status": "ok", "mensaje": "✅ Cliente actualizado"})

@app.delete("/api/admin/clientes/{cliente_id}")
async def eliminar_cliente(cliente_id: int):
    """Elimina un cliente"""
    conn = get_db()
    conn.execute("DELETE FROM clientes WHERE id = ?", (cliente_id,))
    conn.commit()
    conn.close()
    return JSONResponse({"status": "ok", "mensaje": "🗑️ Cliente eliminado"})

# ═══════════════════════════════════════════════════════════
#  ENDPOINTS DE FACTURAS (MULTI-EMPRESA)
# ═══════════════════════════════════════════════════════════

@app.post("/api/empresas/{empresa_id}/invoices/upload")
async def upload_invoice(empresa_id: int, file: UploadFile = File(...)):
    """Recibe imagen de factura desde el navegador"""
    obtener_empresa_o_error(empresa_id)
    contenido = await file.read()
    resultado = procesar_y_guardar_factura(contenido, empresa_id)
    return JSONResponse(resultado)

@app.post("/api/empresas/{empresa_id}/invoices/upload-base64")
async def upload_invoice_base64(empresa_id: int, data: dict):
    """Recibe imagen en base64 desde el bot de WhatsApp"""
    obtener_empresa_o_error(empresa_id)
    try:
        imagen_b64 = data.get("imagen", "")
        contenido = base64.b64decode(imagen_b64)
        resultado = procesar_y_guardar_factura(contenido, empresa_id)
        return JSONResponse(resultado)
    except Exception as e:
        return JSONResponse({
            "status": "error",
            "mensaje": f"❌ Error al procesar: {str(e)}"
        })

@app.get("/api/empresas/{empresa_id}/invoices")
async def get_invoices(empresa_id: int, limit: int = 50):
    """Obtiene las facturas de una empresa"""
    obtener_empresa_o_error(empresa_id)
    conn = get_db()
    cursor = conn.execute(
        "SELECT * FROM invoices WHERE empresa_id = ? ORDER BY fecha_registro DESC LIMIT ?",
        (empresa_id, limit)
    )
    invoices = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return JSONResponse(invoices)

@app.get("/api/empresas/{empresa_id}/invoices/stats")
async def get_stats(empresa_id: int):
    """Estadísticas para el dashboard de una empresa"""
    obtener_empresa_o_error(empresa_id)
    conn = get_db()
    
    cursor = conn.execute("SELECT SUM(total) as total FROM invoices WHERE empresa_id = ?", (empresa_id,))
    total_gastado = dict(cursor.fetchone())["total"] or 0
    
    cursor = conn.execute("SELECT COUNT(*) as count FROM invoices WHERE empresa_id = ?", (empresa_id,))
    total_facturas = dict(cursor.fetchone())["count"]
    
    cursor = conn.execute("""
        SELECT categoria, SUM(total) as total, COUNT(*) as count 
        FROM invoices WHERE empresa_id = ?
        GROUP BY categoria ORDER BY total DESC
    """, (empresa_id,))
    categorias = [dict(row) for row in cursor.fetchall()]
    
    cursor = conn.execute("""
        SELECT strftime('%Y-%m', fecha) as mes, SUM(total) as total 
        FROM invoices WHERE empresa_id = ?
        GROUP BY mes ORDER BY mes DESC LIMIT 6
    """, (empresa_id,))
    meses = [dict(row) for row in cursor.fetchall()]
    meses.reverse()
    
    cursor = conn.execute("""
        SELECT proveedor, SUM(total) as total, COUNT(*) as count 
        FROM invoices WHERE empresa_id = ?
        GROUP BY proveedor ORDER BY total DESC LIMIT 5
    """, (empresa_id,))
    proveedores = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    
    return JSONResponse({
        "total_gastado": round(total_gastado, 2),
        "total_facturas": total_facturas,
        "promedio": round(total_gastado / total_facturas, 2) if total_facturas > 0 else 0,
        "categorias": categorias,
        "meses": meses,
        "proveedores": proveedores
    })

@app.post("/api/empresas/{empresa_id}/budgets")
async def set_budget(empresa_id: int, data: dict):
    """Establece un presupuesto por categoría para una empresa"""
    obtener_empresa_o_error(empresa_id)
    categoria = data.get("categoria", "")
    limite = data.get("limite", 0)
    
    if not categoria or not limite:
        return JSONResponse({"status": "error", "mensaje": "Faltan datos: categoria y limite son requeridos"})
    
    mes = datetime.now().strftime("%Y-%m")
    conn = get_db()
    conn.execute("""
        INSERT OR REPLACE INTO budgets (empresa_id, categoria, limite, mes)
        VALUES (?, ?, ?, ?)
    """, (empresa_id, categoria, float(limite), mes))
    conn.commit()
    conn.close()
    return JSONResponse({"status": "ok", "mensaje": f"Presupuesto de ${float(limite)} para {categoria}"})

@app.get("/api/empresas/{empresa_id}/alerts")
async def get_alerts(empresa_id: int):
    """Alertas de presupuesto para una empresa"""
    obtener_empresa_o_error(empresa_id)
    conn = get_db()
    cursor = conn.execute("""
        SELECT b.categoria, b.limite, COALESCE(SUM(i.total), 0) as gastado
        FROM budgets b
        LEFT JOIN invoices i ON b.empresa_id = i.empresa_id AND b.categoria = i.categoria 
            AND strftime('%Y-%m', i.fecha) = b.mes
        WHERE b.empresa_id = ?
        GROUP BY b.categoria
        HAVING gastado > b.limite * 0.8
    """, (empresa_id,))
    alerts = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return JSONResponse(alerts)

@app.delete("/api/empresas/{empresa_id}/invoices/clear-all")
async def clear_all_invoices(empresa_id: int):
    """Borra todas las facturas y presupuestos de una empresa"""
    obtener_empresa_o_error(empresa_id)
    conn = get_db()
    conn.execute("DELETE FROM invoices WHERE empresa_id = ?", (empresa_id,))
    conn.execute("DELETE FROM budgets WHERE empresa_id = ?", (empresa_id,))
    conn.commit()
    conn.close()
    return JSONResponse({"status": "ok", "mensaje": "✅ Todos los datos han sido eliminados"})

# ═══════════════════════════════════════════════════════════
#  ENDPOINTS PARA EL BOT DE WHATSAPP
# ═══════════════════════════════════════════════════════════

@app.get("/api/bot/{empresa_id}/config")
async def get_bot_config(empresa_id: int):
    """Obtiene la configuración del bot para una empresa"""
    conn = get_db()
    cursor = conn.execute("""
        SELECT bc.*, e.nombre as empresa_nombre, e.rubro, e.color_hex, e.color_nombre
        FROM bots_config bc
        JOIN empresas e ON bc.empresa_id = e.id
        WHERE bc.empresa_id = ? AND bc.activo = 1 AND e.activo = 1
    """, (empresa_id,))
    config = dict(cursor.fetchone()) if cursor.fetchone() else None
    conn.close()
    
    if not config:
        raise HTTPException(status_code=404, detail="Configuración de bot no encontrada")
    
    # Agregar comandos según la plantilla
    plantilla = PLANTILLAS_BOT.get(config["plantilla"], PLANTILLAS_BOT["general"])
    config["comandos"] = plantilla["comandos"]
    config["menu"] = generar_menu_empresa(config["empresa_nombre"], config["nombre_bot"], plantilla)
    
    return JSONResponse(config)

@app.post("/api/bot/{empresa_id}/status")
async def update_bot_status(empresa_id: int, data: dict):
    """Actualiza el estado de conexión del bot"""
    estado = data.get("estado", "desconectado")
    conn = get_db()
    conn.execute("""
        UPDATE bots_config SET estado = ?, ultima_conexion = ? WHERE empresa_id = ?
    """, (estado, datetime.now().isoformat(), empresa_id))
    conn.commit()
    conn.close()
    return JSONResponse({"status": "ok"})

def generar_menu_empresa(nombre_empresa: str, nombre_bot: str, plantilla: dict) -> str:
    """Genera el menú principal personalizado para una empresa"""
    icono = plantilla["icono"]
    comandos = plantilla["comandos"]
    
    menu = f"{icono} *{nombre_bot}*\n"
    menu += f"¡Bienvenido, *{nombre_empresa}*! 👋\n\n"
    menu += f"*{plantilla['descripcion']}*\n\n"
    menu += "*¿Qué deseas hacer?*\n\n"
    
    # Mapeo de comandos a descripciones
    descripciones = {
        "gastos": "📊 Ver mis gastos",
        "facturas": "📋 Ver mis facturas",
        "presupuesto": "💰 Establecer presupuesto",
        "alertas": "⚠️ Ver alertas",
        "web": "🌐 Abrir dashboard web",
        "foto": "📸 Registrar factura (envía foto)",
        "registrar material": "🧱 Registrar material",
        "registrar obra": "🏗️ Registrar nueva obra",
        "ver obras": "📋 Ver mis obras",
        "gastos de obra": "💰 Gastos por obra",
        "presupuesto obra": "📊 Presupuesto de obra",
        "materiales": "📦 Lista de materiales",
        "registrar venta": "🛒 Registrar venta",
        "registrar compra": "📥 Registrar compra",
        "inventario": "📦 Ver inventario",
        "gastos del día": "📊 Gastos del día",
        "proveedores": "🏢 Mis proveedores",
        "registrar paciente": "👤 Registrar paciente",
        "registrar insumo": "💊 Registrar insumo",
        "citas hoy": "📅 Citas de hoy",
        "gastos médicos": "💰 Gastos médicos",
        "registrar envío": "📦 Registrar envío",
        "rastrear pedido": "🔍 Rastrear pedido",
        "gastos de ruta": "🚛 Gastos de ruta",
        "vehículos": "🚗 Vehículos",
        "inventario cocina": "🍳 Inventario cocina",
    }
    
    idx = 1
    for cmd in comandos:
        desc = descripciones.get(cmd, f"🔹 {cmd.capitalize()}")
        menu += f"{idx}️⃣ {desc}\n"
        idx += 1
    
    menu += "\n━━━━━━━━━━━━━━━━━━━━━\n"
    menu += "Responde con el *número* o escribe el *comando*\n\n"
    menu += f"Ej: *\"{comandos[0]}\"* para ver opciones\n"
    
    return menu

# ═══════════════════════════════════════════════════════════
#  ENDPOINTS DE COMANDOS PERSONALIZADOS
# ═══════════════════════════════════════════════════════════

@app.get("/api/empresas/{empresa_id}/comandos")
async def listar_comandos_personalizados(empresa_id: int, activo: bool = None):
    """Lista los comandos personalizados de una empresa"""
    obtener_empresa_o_error(empresa_id)
    conn = get_db()
    
    query = "SELECT * FROM comandos_personalizados WHERE empresa_id = ?"
    params = [empresa_id]
    
    if activo is not None:
        query += " AND activo = ?"
        params.append(1 if activo else 0)
    
    query += " ORDER BY comando ASC"
    
    cursor = conn.execute(query, params)
    comandos = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return JSONResponse(comandos)

@app.post("/api/empresas/{empresa_id}/comandos")
async def crear_comando_personalizado(empresa_id: int, data: dict):
    """Crea un nuevo comando personalizado para una empresa"""
    obtener_empresa_o_error(empresa_id)
    
    comando = data.get("comando", "").strip().lower()
    descripcion = data.get("descripcion", "").strip()
    tipo = data.get("tipo", "simple")
    config = data.get("config", {})
    
    if not comando:
        return JSONResponse({"status": "error", "mensaje": "El comando es requerido"}, status_code=400)
    
    if tipo not in ("simple", "formulario"):
        return JSONResponse({"status": "error", "mensaje": "El tipo debe ser 'simple' o 'formulario'"}, status_code=400)
    
    conn = get_db()
    
    # Verificar que no exista un comando duplicado para esta empresa
    cursor = conn.execute(
        "SELECT id FROM comandos_personalizados WHERE empresa_id = ? AND comando = ?",
        (empresa_id, comando)
    )
    if cursor.fetchone():
        conn.close()
        return JSONResponse({"status": "error", "mensaje": f"El comando '{comando}' ya existe para esta empresa"}, status_code=409)
    
    conn.execute("""
        INSERT INTO comandos_personalizados (empresa_id, comando, descripcion, tipo, config, activo)
        VALUES (?, ?, ?, ?, ?, 1)
    """, (empresa_id, comando, descripcion, tipo, json.dumps(config)))
    conn.commit()
    conn.close()
    
    return JSONResponse({
        "status": "ok",
        "mensaje": f"✅ Comando '{comando}' creado exitosamente"
    })

@app.put("/api/empresas/{empresa_id}/comandos/{comando_id}")
async def actualizar_comando_personalizado(empresa_id: int, comando_id: int, data: dict):
    """Actualiza un comando personalizado"""
    obtener_empresa_o_error(empresa_id)
    
    conn = get_db()
    
    # Verificar que el comando exista y pertenezca a la empresa
    cursor = conn.execute(
        "SELECT id FROM comandos_personalizados WHERE id = ? AND empresa_id = ?",
        (comando_id, empresa_id)
    )
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Comando no encontrado")
    
    campos = []
    params = []
    
    for campo in ["comando", "descripcion", "tipo", "activo"]:
        if campo in data:
            if campo == "comando":
                data[campo] = data[campo].strip().lower()
            campos.append(f"{campo} = ?")
            params.append(data[campo])
    
    if "config" in data:
        campos.append("config = ?")
        params.append(json.dumps(data["config"]))
    
    if not campos:
        conn.close()
        return JSONResponse({"status": "error", "mensaje": "No hay campos para actualizar"})
    
    params.append(comando_id)
    conn.execute(f"UPDATE comandos_personalizados SET {', '.join(campos)} WHERE id = ?", params)
    conn.commit()
    conn.close()
    
    return JSONResponse({"status": "ok", "mensaje": "✅ Comando actualizado"})

@app.delete("/api/empresas/{empresa_id}/comandos/{comando_id}")
async def eliminar_comando_personalizado(empresa_id: int, comando_id: int):
    """Elimina un comando personalizado"""
    obtener_empresa_o_error(empresa_id)
    
    conn = get_db()
    cursor = conn.execute(
        "SELECT comando FROM comandos_personalizados WHERE id = ? AND empresa_id = ?",
        (comando_id, empresa_id)
    )
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Comando no encontrado")
    
    comando = row["comando"]
    conn.execute("DELETE FROM comandos_personalizados WHERE id = ?", (comando_id,))
    conn.commit()
    conn.close()
    
    return JSONResponse({"status": "ok", "mensaje": f"🗑️ Comando '{comando}' eliminado"})

@app.post("/api/empresas/{empresa_id}/registros-formularios")
async def guardar_registro_formulario(empresa_id: int, data: dict):
    """Guarda un registro de formulario completado por el bot"""
    obtener_empresa_o_error(empresa_id)
    
    comando = data.get("comando", "")
    comando_id = data.get("comando_id")
    telefono = data.get("telefono", "")
    datos = data.get("datos", {})
    
    if not comando or not telefono:
        return JSONResponse({"status": "error", "mensaje": "Faltan datos requeridos"}, status_code=400)
    
    conn = get_db()
    conn.execute("""
        INSERT INTO registros_formularios (empresa_id, comando_id, comando, telefono, datos, fecha_registro)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (empresa_id, comando_id, comando, telefono, json.dumps(datos), datetime.now().isoformat()))
    conn.commit()
    conn.close()
    
    return JSONResponse({"status": "ok", "mensaje": "✅ Registro guardado"})

@app.get("/api/empresas/{empresa_id}/registros-formularios")
async def listar_registros_formularios(empresa_id: int, limit: int = 50):
    """Lista los registros de formularios de una empresa"""
    obtener_empresa_o_error(empresa_id)
    conn = get_db()
    cursor = conn.execute("""
        SELECT * FROM registros_formularios 
        WHERE empresa_id = ? 
        ORDER BY fecha_registro DESC LIMIT ?
    """, (empresa_id, limit))
    registros = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return JSONResponse(registros)

@app.get("/api/bot/{empresa_id}/comandos-personalizados")
async def get_comandos_personalizados_bot(empresa_id: int):
    """Obtiene los comandos personalizados activos para el bot"""
    conn = get_db()
    cursor = conn.execute("""
        SELECT id, comando, descripcion, tipo, config 
        FROM comandos_personalizados 
        WHERE empresa_id = ? AND activo = 1
        ORDER BY comando ASC
    """, (empresa_id,))
    comandos = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    # Parsear config de JSON string a dict
    for cmd in comandos:
        if isinstance(cmd.get("config"), str):
            try:
                cmd["config"] = json.loads(cmd["config"])
            except (json.JSONDecodeError, TypeError):
                cmd["config"] = {}
    
    return JSONResponse(comandos)

if __name__ == "__main__":
    print("""
    ╔══════════════════════════════════════╗
    ║     INVOICEFLOW SaaS v2.0            ║
    ║  Sistema Multi-Empresa               ║
    ║                                      ║
    ║  🌐 http://localhost:8000            ║
    ║  📊 Panel Admin: /admin.html        ║
    ║  🤖 Bot API: /api/bot/{id}/config   ║
    ╚══════════════════════════════════════╝
    """)
    uvicorn.run(app, host="0.0.0.0", port=8000)
