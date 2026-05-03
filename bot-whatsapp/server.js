/**
 * INVOICEFLOW SaaS — Servidor Único (API + Bots)
 * 
 * AHORA: Servidor autónomo que NO depende de FastAPI/Python.
 * - API REST completa (empresas, facturas, presupuestos, comandos, etc.)
 * - Gestor de bots de WhatsApp multi-empresa
 * - Panel web de administración
 * - Sirve archivos estáticos (dashboard, admin)
 * 
 * Uso:
 *   node server.js                    # Inicia API + todos los bots activos
 *   PORT=3000 node server.js          # Puerto personalizado
 */

const express = require('express');
const path = require('path');
const qrcode = require('qrcode');
const fileUpload = require('express-fileupload');
const botManager = require('../src/bot/botManager');
const apiRoutes = require('../src/api/routes');

const PORT = process.env.PORT || 3000;
const app = express();

// ─── MIDDLEWARE ───────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    abortOnLimit: true
}));

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Archivos estáticos
app.use('/static', express.static(path.join(__dirname, '..', 'static')));

// ─── RUTAS DE LA API ─────────────────────────────────────────
// Todas las rutas de la API REST (reemplaza a FastAPI)
app.use(apiRoutes);

// ═══════════════════════════════════════════════════════════
//  ENDPOINTS DE BOTS (usando botManager)
// ═══════════════════════════════════════════════════════════

// Estado de todos los bots
app.get('/api/bots/status', (req, res) => {
    res.json(botManager.listAllStatus());
});

// Estado de un bot específico
app.get('/api/bots/status/:empresaId', (req, res) => {
    const empresaId = parseInt(req.params.empresaId);
    res.json(botManager.getStatus(empresaId));
});

// Estado de un bot específico (formato alternativo)
app.get('/api/bots/:empresaId/status', (req, res) => {
    const empresaId = parseInt(req.params.empresaId);
    res.json(botManager.getStatus(empresaId));
});

// Iniciar un bot específico
app.post('/api/bots/start/:empresaId', async (req, res) => {
    const empresaId = parseInt(req.params.empresaId);
    try {
        const sesion = await botManager.startBot(empresaId);
        if (sesion) {
            res.json({ status: 'ok', mensaje: `Bot de empresa #${empresaId} iniciando...` });
        } else {
            res.status(500).json({ status: 'error', mensaje: `No se pudo iniciar el bot #${empresaId}` });
        }
    } catch (error) {
        res.status(500).json({ status: 'error', mensaje: error.message });
    }
});

// Iniciar un bot específico (formato alternativo)
app.post('/api/bots/:empresaId/start', async (req, res) => {
    const empresaId = parseInt(req.params.empresaId);
    try {
        const sesion = await botManager.startBot(empresaId);
        if (sesion) {
            res.json({ status: 'ok', mensaje: `Bot de empresa #${empresaId} iniciando...` });
        } else {
            res.status(500).json({ status: 'error', mensaje: `No se pudo iniciar el bot #${empresaId}` });
        }
    } catch (error) {
        res.status(500).json({ status: 'error', mensaje: error.message });
    }
});

// Detener un bot específico
app.post('/api/bots/stop/:empresaId', async (req, res) => {
    const empresaId = parseInt(req.params.empresaId);
    try {
        await botManager.stopBot(empresaId);
        res.json({ status: 'ok', mensaje: `Bot de empresa #${empresaId} detenido` });
    } catch (error) {
        res.status(500).json({ status: 'error', mensaje: error.message });
    }
});

// Detener un bot específico (formato alternativo)
app.post('/api/bots/:empresaId/stop', async (req, res) => {
    const empresaId = parseInt(req.params.empresaId);
    try {
        await botManager.stopBot(empresaId);
        res.json({ status: 'ok', mensaje: `Bot de empresa #${empresaId} detenido` });
    } catch (error) {
        res.status(500).json({ status: 'error', mensaje: error.message });
    }
});

// Iniciar todos los bots
app.post('/api/bots/start-all', async (req, res) => {
    try {
        await botManager.startAllBots();
        res.json({ status: 'ok', mensaje: 'Iniciando todos los bots...' });
    } catch (error) {
        res.status(500).json({ status: 'error', mensaje: error.message });
    }
});

// QR de un bot específico
app.get('/api/bots/:empresaId/qr', async (req, res) => {
    const empresaId = parseInt(req.params.empresaId);
    const status = botManager.getStatus(empresaId);
    
    if (!status.qr) {
        return res.json({ qr: null, estado: status.estado });
    }
    
    try {
        const sesion = botManager.sesiones.get(empresaId);
        if (!sesion || !sesion.qrGenerado) {
            return res.json({ qr: null, estado: status.estado });
        }
        
        const color = status.empresa?.color || '#00F5FF';
        const qrDataUrl = await qrcode.toDataURL(sesion.qrGenerado, {
            color: { dark: color, light: '#0A0A1A' },
            width: 400, margin: 2
        });
        
        res.json({ qr: qrDataUrl, estado: status.estado, empresa: status.empresa });
    } catch (err) {
        res.status(500).json({ error: 'Error generando QR' });
    }
});

// ═══════════════════════════════════════════════════════════
//  PÁGINAS WEB
// ═══════════════════════════════════════════════════════════

// Página principal - Gestor de Bots
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>InvoiceFlow — Gestor de Bots</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', sans-serif;
            background: #0A0A1A;
            color: #fff;
            min-height: 100vh;
            padding: 40px 20px;
        }
        .container { max-width: 900px; margin: 0 auto; }
        h1 { font-size: 28px; font-weight: 800; margin-bottom: 8px; }
        .subtitle { color: rgba(255,255,255,0.5); margin-bottom: 40px; }
        .bots-grid { display: grid; gap: 16px; }
        .bot-card {
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 16px;
            padding: 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            backdrop-filter: blur(12px);
        }
        .bot-info { display: flex; align-items: center; gap: 16px; }
        .bot-status {
            width: 12px; height: 12px;
            border-radius: 50%;
        }
        .bot-status.connected { background: #00FF64; box-shadow: 0 0 10px rgba(0,255,100,0.5); }
        .bot-status.connecting { background: #FFD700; box-shadow: 0 0 10px rgba(255,215,0,0.5); animation: pulse 1.5s infinite; }
        .bot-status.disconnected { background: #ef4444; }
        .bot-status.inactive { background: #666; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .bot-name { font-weight: 600; font-size: 16px; }
        .bot-detail { color: rgba(255,255,255,0.4); font-size: 13px; margin-top: 4px; }
        .bot-actions { display: flex; gap: 8px; }
        .btn {
            padding: 8px 16px;
            border-radius: 8px;
            border: none;
            font-family: 'Inter', sans-serif;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
        }
        .btn-start { background: rgba(0,255,100,0.15); color: #00FF64; }
        .btn-start:hover { background: rgba(0,255,100,0.25); }
        .btn-stop { background: rgba(239,68,68,0.15); color: #ef4444; }
        .btn-stop:hover { background: rgba(239,68,68,0.25); }
        .btn-refresh { background: rgba(59,130,246,0.15); color: #3b82f6; }
        .btn-refresh:hover { background: rgba(59,130,246,0.25); }
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: rgba(255,255,255,0.3);
        }
        .empty-state h3 { font-size: 20px; margin-bottom: 8px; }
        .header-actions { display: flex; gap: 12px; margin-bottom: 24px; }
        .badge { 
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
        }
        .badge-online { background: rgba(0,255,100,0.15); color: #00FF64; }
        .badge-offline { background: rgba(239,68,68,0.15); color: #ef4444; }
        .nav-links { margin-bottom: 30px; display: flex; gap: 16px; }
        .nav-links a { color: rgba(255,255,255,0.5); text-decoration: none; font-size: 14px; transition: color 0.2s; }
        .nav-links a:hover { color: #00d4aa; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 InvoiceFlow — Gestor de Bots</h1>
        <p class="subtitle">Panel de control de bots de WhatsApp multi-empresa</p>
        
        <div class="nav-links">
            <a href="/admin">⚙️ Panel de Administración</a>
            <a href="/health">💚 Health Check</a>
        </div>
        
        <div class="header-actions">
            <button class="btn btn-start" onclick="startAll()">🚀 Iniciar Todos</button>
            <button class="btn btn-refresh" onclick="loadBots()">🔄 Refrescar</button>
        </div>
        
        <div class="bots-grid" id="botsGrid">
            <div class="empty-state">
                <h3>Cargando...</h3>
                <p>Consultando estado de los bots</p>
            </div>
        </div>
    </div>
    
    <script>
        async function loadBots() {
            try {
                const res = await fetch('/api/bots/status');
                const bots = await res.json();
                
                const grid = document.getElementById('botsGrid');
                const entries = Object.entries(bots);
                
                if (entries.length === 0) {
                    grid.innerHTML = \`
                        <div class="empty-state">
                            <h3>📭 No hay bots activos</h3>
                            <p>Inicia un bot desde el panel admin o usa "Iniciar Todos"</p>
                        </div>
                    \`;
                    return;
                }
                
                grid.innerHTML = entries.map(([id, bot]) => {
                    const statusClass = bot.estado === 'conectado' ? 'connected' : 
                                       bot.estado === 'conectando' || bot.estado === 'esperando_escaneo' ? 'connecting' :
                                       bot.estado === 'inactivo' ? 'inactive' : 'disconnected';
                    
                    const statusText = bot.estado === 'conectado' ? '✅ Conectado' :
                                       bot.estado === 'conectando' ? '⏳ Conectando...' :
                                       bot.estado === 'esperando_escaneo' ? '📱 Escanea QR' :
                                       bot.estado === 'inactivo' ? '❌ Inactivo' : '🔴 Desconectado';
                    
                    const empresa = bot.empresa || { nombre: \`Empresa #\${id}\`, nombre_bot: 'Sin configurar', rubro: '—' };
                    
                    return \`
                        <div class="bot-card">
                            <div class="bot-info">
                                <div class="bot-status \${statusClass}"></div>
                                <div>
                                    <div class="bot-name">\${empresa.nombre}</div>
                                    <div class="bot-detail">
                                        🤖 \${empresa.nombre_bot} · 🏗️ \${empresa.rubro} · \${statusText}
                                        \${bot.ultima_actividad ? ' · 🕐 ' + new Date(bot.ultima_actividad).toLocaleTimeString() : ''}
                                        \${bot.formularios_activos > 0 ? ' · 📝 ' + bot.formularios_activos + ' formularios activos' : ''}
                                    </div>
                                </div>
                            </div>
                            <div class="bot-actions">
                                \${bot.estado !== 'conectado' ? \`<button class="btn btn-start" onclick="startBot(\${id})">▶ Iniciar</button>\` : ''}
                                \${bot.estado === 'conectado' || bot.estado === 'esperando_escaneo' ? \`<button class="btn btn-stop" onclick="stopBot(\${id})">⏹ Detener</button>\` : ''}
                            </div>
                        </div>
                    \`;
                }).join('');
            } catch (err) {
                document.getElementById('botsGrid').innerHTML = \`
                    <div class="empty-state">
                        <h3>❌ Error de conexión</h3>
                        <p>No se pudo conectar con el servidor de bots</p>
                    </div>
                \`;
            }
        }
        
        async function startBot(id) {
            try {
                await fetch(\`/api/bots/\${id}/start\`, { method: 'POST' });
                setTimeout(loadBots, 1000);
            } catch (err) {
                alert('Error al iniciar bot');
            }
        }
        
        async function stopBot(id) {
            try {
                await fetch(\`/api/bots/\${id}/stop\`, { method: 'POST' });
                loadBots();
            } catch (err) {
                alert('Error al detener bot');
            }
        }
        
        async function startAll() {
            try {
                await fetch('/api/bots/start-all', { method: 'POST' });
                setTimeout(loadBots, 2000);
            } catch (err) {
                alert('Error al iniciar bots');
            }
        }
        
        loadBots();
        setInterval(loadBots, 5000);
    </script>
</body>
</html>`);
});

// Dashboard (redirige al HTML estático)
app.get('/dashboard', (req, res) => {
    const htmlPath = path.join(__dirname, '..', 'templates', 'dashboard.html');
    res.sendFile(htmlPath);
});

// Panel de administración
app.get('/admin', (req, res) => {
    const htmlPath = path.join(__dirname, '..', 'templates', 'admin.html');
    res.sendFile(htmlPath);
});

// Dashboard específico de empresa
app.get('/empresa/:empresaId', (req, res) => {
    const htmlPath = path.join(__dirname, '..', 'templates', 'dashboard.html');
    res.sendFile(htmlPath);
});

// ═══════════════════════════════════════════════════════════
//  INICIAR SERVIDOR
// ═══════════════════════════════════════════════════════════

app.listen(PORT, () => {
    console.log(`\n    ╔══════════════════════════════════════╗`);
    console.log(`    ║   INVOICEFLOW — Servidor Único     ║`);
    console.log(`    ║   (API + Bots + Web)               ║`);
    console.log(`    ║                                      ║`);
    console.log(`    ║  🌐 http://localhost:${PORT}${' '.repeat(18 - String(PORT).length)}║`);
    console.log(`    ║  💚 /health                         ║`);
    console.log(`    ║  ⚙️  /admin                          ║`);
    console.log(`    ║  📊 /api/bots/status                ║`);
    console.log(`    ║  🚀 Iniciando bots activos...       ║`);
    console.log(`    ╚══════════════════════════════════════╝\n`);
    
    // Iniciar todos los bots automáticamente (con setTimeout para no bloquear)
    setTimeout(async () => {
        try {
            await botManager.startAllBots();
        } catch (err) {
            console.error('❌ Error al iniciar bots (no crítico):', err.message);
        }
        console.log(`    ║  ✅ Servidor listo — ${botManager.listAllStatus().length} bots en memoria`);
        console.log(`    ╚══════════════════════════════════════════╝\n`);
    }, 100);
});
