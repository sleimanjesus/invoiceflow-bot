"""
INVOICEFLOW SaaS — Script de Inicio
Ejecuta: python start.py

Esto inicia:
1. Backend API (FastAPI) en http://localhost:8000
2. Panel Admin en http://localhost:8000/admin
3. Dashboard en http://localhost:8000
"""

import subprocess
import sys
import os
import webbrowser
import time

def main():
    print("""
    ╔══════════════════════════════════════════════╗
    ║        INVOICEFLOW SaaS v2.0                ║
    ║     Sistema Multi-Empresa de Facturación     ║
    ║                                              ║
    ║  🚀 Iniciando servicios...                   ║
    ╚══════════════════════════════════════════════╝
    """)
    
    # Verificar que estamos en el directorio correcto
    base_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(base_dir)
    
    # Verificar dependencias
    print("📦 Verificando dependencias...")
    try:
        import fastapi
        import uvicorn
        print("✅ Dependencias de Python OK")
    except ImportError:
        print("📦 Instalando dependencias de Python...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
        print("✅ Dependencias instaladas")
    
    # Iniciar servidor
    print("\n" + "="*50)
    print("  🌐 Backend: http://localhost:8000")
    print("  📊 Admin:   http://localhost:8000/admin")
    print("  🤖 Bot API: http://localhost:8000/api/bot/{id}/config")
    print("="*50 + "\n")
    
    # Abrir navegador
    time.sleep(1)
    webbrowser.open('http://localhost:8000/admin')
    
    # Iniciar servidor
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

if __name__ == "__main__":
    main()
