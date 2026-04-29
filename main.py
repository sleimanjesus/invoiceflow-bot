"""
INVOICEFLOW — Sistema de Facturación Inteligente por WhatsApp
Backend: FastAPI + SQLite + DeepSeek Vision
Diseño: Financial OS (glassmorphism, premium)
"""

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
import base64
import uvicorn
import sqlite3
import json
import os
from datetime import datetime, date
import hashlib

# ─── Configuración ───
app = FastAPI(title="InvoiceFlow", version="1.0.0")

# CORS para que el bot de WhatsApp pueda conectarse
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
BASE_DIR = os.path.dirname(__file__)

DB_PATH = os.path.join(BASE_DIR, "data", "invoices.db")
UPLOAD_DIR = os.path.join(BASE_DIR, "data", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ─── Base de Datos ───
def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            proveedor TEXT,
            fecha TEXT,
            total REAL,
            categoria TEXT,
            numero_factura TEXT,
            tipo_gasto TEXT DEFAULT 'variable',
            notas TEXT,
            fecha_registro TEXT,
            hash_imagen TEXT UNIQUE
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            categoria TEXT UNIQUE,
            limite REAL,
            mes TEXT
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

def extraer_factura_simulada(filename: str) -> dict:
    """Simula la extracción de datos (reemplazar con DeepSeek Vision)"""
    import random
    proveedores = ["Distribuidora Los Andes", "Farmacia San José", "Comercial El Sol", 
                   "Inversiones 2000", "Distribuidora Polar", "Mercado Municipal"]
    categorias = ["Alimentos", "Salud", "Oficina", "Servicios", "Transporte", "Tecnología"]
    
    return {
        "proveedor": random.choice(proveedores),
        "fecha": date.today().isoformat(),
        "total": round(random.uniform(10, 500), 2),
        "categoria": random.choice(categorias),
        "numero_factura": f"F-{random.randint(1000, 9999)}",
        "tipo_gasto": random.choice(["fijo", "variable"])
    }

def analizar_gasto(datos: dict) -> dict:
    """Analiza el gasto y devuelve insights"""
    conn = get_db()
    
    mes_actual = datetime.now().strftime("%Y-%m")
    cursor = conn.execute("""
        SELECT COUNT(*) as total, SUM(total) as suma 
        FROM invoices 
        WHERE strftime('%Y-%m', fecha) = ?
    """, (mes_actual,))
    resumen_mes = dict(cursor.fetchone())
    
    cursor = conn.execute("""
        SELECT COUNT(*) as count FROM invoices 
        WHERE proveedor = ? AND id != (SELECT MAX(id) FROM invoices)
    """, (datos["proveedor"],))
    gastos_previos = dict(cursor.fetchone())
    
    cursor = conn.execute("""
        SELECT COUNT(*) as count FROM invoices 
        WHERE total = ? AND proveedor = ? AND id != (SELECT MAX(id) FROM invoices)
    """, (datos["total"], datos["proveedor"]))
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

def procesar_y_guardar_factura(contenido: bytes) -> dict:
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
            INSERT INTO invoices (proveedor, fecha, total, categoria, numero_factura, tipo_gasto, fecha_registro, hash_imagen)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
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
        
        analisis = analizar_gasto(datos)
        
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

# ─── Endpoints ───

@app.get("/", response_class=HTMLResponse)
async def dashboard():
    html_path = os.path.join(BASE_DIR, "templates", "dashboard.html")
    with open(html_path, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

@app.post("/api/invoices/upload")
async def upload_invoice(file: UploadFile = File(...)):
    """Recibe imagen de factura desde el navegador"""
    contenido = await file.read()
    resultado = procesar_y_guardar_factura(contenido)
    return JSONResponse(resultado)

@app.post("/api/invoices/upload-base64")
async def upload_invoice_base64(data: dict):
    """Recibe imagen en base64 desde el bot de WhatsApp"""
    try:
        imagen_b64 = data.get("imagen", "")
        contenido = base64.b64decode(imagen_b64)
        resultado = procesar_y_guardar_factura(contenido)
        return JSONResponse(resultado)
    except Exception as e:
        return JSONResponse({
            "status": "error",
            "mensaje": f"❌ Error al procesar: {str(e)}"
        })

@app.get("/api/invoices")
async def get_invoices():
    """Obtiene todas las facturas"""
    conn = get_db()
    cursor = conn.execute("SELECT * FROM invoices ORDER BY fecha_registro DESC")
    invoices = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return JSONResponse(invoices)

@app.get("/api/invoices/stats")
async def get_stats():
    """Estadísticas para el dashboard"""
    conn = get_db()
    
    cursor = conn.execute("SELECT SUM(total) as total FROM invoices")
    total_gastado = dict(cursor.fetchone())["total"] or 0
    
    cursor = conn.execute("SELECT COUNT(*) as count FROM invoices")
    total_facturas = dict(cursor.fetchone())["count"]
    
    cursor = conn.execute("""
        SELECT categoria, SUM(total) as total, COUNT(*) as count 
        FROM invoices GROUP BY categoria ORDER BY total DESC
    """)
    categorias = [dict(row) for row in cursor.fetchall()]
    
    cursor = conn.execute("""
        SELECT strftime('%Y-%m', fecha) as mes, SUM(total) as total 
        FROM invoices 
        GROUP BY mes ORDER BY mes DESC LIMIT 6
    """)
    meses = [dict(row) for row in cursor.fetchall()]
    meses.reverse()
    
    cursor = conn.execute("""
        SELECT proveedor, SUM(total) as total, COUNT(*) as count 
        FROM invoices GROUP BY proveedor ORDER BY total DESC LIMIT 5
    """)
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

@app.post("/api/budgets")
async def set_budget(categoria: str = Form(...), limite: float = Form(...)):
    """Establece un presupuesto por categoría"""
    mes = datetime.now().strftime("%Y-%m")
    conn = get_db()
    conn.execute("""
        INSERT OR REPLACE INTO budgets (categoria, limite, mes)
        VALUES (?, ?, ?)
    """, (categoria, limite, mes))
    conn.commit()
    conn.close()
    return JSONResponse({"status": "ok", "mensaje": f"Presupuesto de ${limite} para {categoria}"})

@app.get("/api/alerts")
async def get_alerts():
    """Alertas de presupuesto"""
    conn = get_db()
    cursor = conn.execute("""
        SELECT b.categoria, b.limite, COALESCE(SUM(i.total), 0) as gastado
        FROM budgets b
        LEFT JOIN invoices i ON b.categoria = i.categoria 
            AND strftime('%Y-%m', i.fecha) = b.mes
        GROUP BY b.categoria
        HAVING gastado > b.limite * 0.8
    """)
    alerts = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return JSONResponse(alerts)

if __name__ == "__main__":
    print("""
    ╔══════════════════════════════════════╗
    ║        INVOICEFLOW v1.0              ║
    ║  Sistema de Facturación Inteligente   ║
    ╚══════════════════════════════════════╝
    """)
    uvicorn.run(app, host="0.0.0.0", port=8000)
