n/**
 * INVOICEFLOW — Bot de WhatsApp + Servidor QR Profesional
 * 
 * TODO EN UNO: Muestra QR en web + procesa mensajes
 * 
 * USO:
 * 1. node qr-server.js
 * 2. Abre http://localhost:3000 en tu navegador
 * 3. Escanea el QR con WhatsApp
 * 4. ¡El bot ya funciona!
 */

const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const https = require('https');
const path = require('path');
const fs = require('fs');

// ─── CONFIGURACIÓN ───
const API_URL = 'https://invoiceflow-jj1p.onrender.com';
const OWNER_NUMBER = '584128048173';
const PORT = 3000;

// ─── SERVIDOR EXPRESS ───
const app = express();
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);

// ─── CLIENTE WHATSAPP ───
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

let qrGenerado = null;
let estado = 'conectando';

// ─── QR ───
client.on('qr', async (qr) => {
    qrGenerado = qr;
    estado = 'esperando_escaneo';
    try {
        await qrcode.toFile(path.join(publicDir, 'qr.png'), qr, {
            color: { dark: '#00F5FF', light: '#0A0A1A' },
            width: 400, margin: 2
        });
        console.log('✅ QR generado como imagen');
    } catch (err) {
        console.error('Error generando QR:', err);
    }
});

client.on('ready', () => {
    estado = 'conectado';
    qrGenerado = null;
    console.log('\n✅ ¡BOT CONECTADO!');
    console.log('📱 InvoiceFlow Bot está funcionando');
    console.log('💬 Envía "hola" desde WhatsApp para probarlo\n');
});

client.on('authenticated', () => {
    console.log('✅ Autenticado correctamente');
});

client.on('auth_failure', (msg) => {
    estado = 'error';
    console.error('❌ Error de autenticación:', msg);
});

client.on('disconnected', (reason) => {
    estado = 'desconectado';
    console.log('❌ Bot desconectado:', reason);
});

// ─── FUNCIONES AUXILIARES ───
function hacerPeticion(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const data = options.body ? JSON.stringify(options.body) : null;
        
        const req = https.request({
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch { resolve(body); }
            });
        });
        
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

// ─── PROCESAR MENSAJES ───
client.on('message', async (message) => {
    try {
        // IGNORAR ESTADOS (status@broadcast)
        if (message.from === 'status@broadcast') return;
        
        // IGNORAR mensajes de grupos
        if (message.from.endsWith('@g.us')) return;
        
        const texto = message.body.toLowerCase().trim();
        const from = message.from;
        
        console.log(`📩 Mensaje de ${from}: ${texto.substring(0, 50)}`);
        
        // Marcar como visto
        await client.sendSeen(from);
        
        // ─── COMANDOS ───
        if (texto === 'ayuda' || texto === 'help' || texto === 'menu' || texto === 'hola') {
            await message.reply(`🤖 *InvoiceFlow - Asistente Financiero*

*Comandos disponibles:*

📸 *Enviar foto de factura*
   → Registra automáticamente el gasto

📊 *"mis gastos"*
   → Resumen de tus gastos del mes

📋 *"mis facturas"*
   → Lista tus últimas 5 facturas

💰 *"presupuesto [categoría] [monto]"*
   → Ej: "presupuesto alimentos 500"

⚠️ *"alertas"*
   → Muestra alertas de presupuesto

🌐 *"web"*
   → Enlace a tu dashboard

❓ *"ayuda"*
   → Este mensaje

━━━━━━━━━━━━━━━━━━━━━
💡 *Consejo:* Envía una foto de tu factura para empezar`);
            return;
        }
        
        if (texto === 'web' || texto === 'dashboard' || texto === 'sitio') {
            await message.reply(`🌐 *Tu Dashboard Financiero*
            
Abre este enlace en tu navegador:
${API_URL}

📊 Ahí puedes ver:
• Todos tus gastos en gráficos
• Facturas registradas
• Alertas de presupuesto
• Estadísticas mensuales`);
            return;
        }
        
        if (texto === 'mis gastos' || texto === 'gastos' || texto === 'resumen') {
            try {
                const stats = await hacerPeticion(`${API_URL}/api/invoices/stats`);
                
                let categorias = '';
                if (stats.categorias && stats.categorias.length > 0) {
                    categorias = stats.categorias.slice(0, 5).map(c => 
                        `• ${c.categoria}: $${c.total.toFixed(2)} (${c.count} facturas)`
                    ).join('\n');
                } else {
                    categorias = '• Aún no hay gastos registrados';
                }
                
                await message.reply(`📊 *Resumen Financiero*

💰 *Total gastado:* $${stats.total_gastado.toFixed(2)}
📄 *Facturas:* ${stats.total_facturas}
📈 *Promedio:* $${stats.promedio.toFixed(2)}

*Por categoría:*
${categorias}

📸 *Envía una foto de tu factura* para registrar un nuevo gasto`);
            } catch (error) {
                await message.reply('❌ Error al consultar tus gastos. Intenta de nuevo.');
            }
            return;
        }
        
        if (texto === 'mis facturas' || texto === 'facturas' || texto === 'ultimas') {
            try {
                const facturas = await hacerPeticion(`${API_URL}/api/invoices`);
                
                if (!facturas || facturas.length === 0) {
                    await message.reply('📋 *No tienes facturas registradas aún*\n\nEnvía una foto de tu factura para empezar.');
                    return;
                }
                
                const ultimas = facturas.slice(0, 5);
                let lista = ultimas.map((f, i) => 
                    `${i+1}. *${f.proveedor}* - $${f.total.toFixed(2)}\n   📅 ${f.fecha} | ${f.categoria}`
                ).join('\n\n');
                
                await message.reply(`📋 *Últimas ${Math.min(5, facturas.length)} facturas:*\n\n${lista}\n\n📊 *"mis gastos"* para ver el resumen completo`);
            } catch (error) {
                await message.reply('❌ Error al consultar facturas.');
            }
            return;
        }
        
        if (texto === 'alertas' || texto === 'alerta') {
            try {
                const alerts = await hacerPeticion(`${API_URL}/api/alerts`);
                
                if (!alerts || alerts.length === 0) {
                    await message.reply('✅ *No hay alertas*\n\nTus presupuestos están en orden.');
                    return;
                }
                
                let lista = alerts.map(a => 
                    `⚠️ *${a.categoria}*: $${a.gastado.toFixed(2)} de $${a.limite.toFixed(2)}`
                ).join('\n');
                
                await message.reply(`🚨 *Alertas de Presupuesto*\n\n${lista}\n\n💰 Usa *"presupuesto [cat] [monto]"* para ajustar`);
            } catch {
                await message.reply('❌ Error al consultar alertas.');
            }
            return;
        }
        
        if (texto.startsWith('presupuesto ')) {
            const partes = texto.replace('presupuesto ', '').split(' ');
            if (partes.length >= 2) {
                const categoria = partes.slice(0, -1).join(' ');
                const monto = parseFloat(partes[partes.length - 1]);
                
                if (!isNaN(monto) && monto > 0) {
                    try {
                        const result = await hacerPeticion(`${API_URL}/api/budgets`, {
                            method: 'POST',
                            body: { categoria, limite: monto }
                        });
                        await message.reply(`💰 *Presupuesto actualizado*\n\n${categoria}: $${monto.toFixed(2)}/mes`);
                    } catch {
                        await message.reply('❌ Error al establecer presupuesto.');
                    }
                    return;
                }
            }
            await message.reply('❌ Formato: *"presupuesto [categoría] [monto]"*\nEj: "presupuesto alimentos 500"');
            return;
        }
        
        // ─── SI ES UNA IMAGEN (FACTURA) ───
        if (message.hasMedia) {
            const media = await message.downloadMedia();
            
            if (media.mimetype && media.mimetype.startsWith('image/')) {
                await message.reply('📸 *Procesando factura...*\n\n⏳ Un momento por favor...');
                
                try {
                    const result = await hacerPeticion(`${API_URL}/api/invoices/upload-base64`, {
                        method: 'POST',
                        body: {
                            imagen: media.data,
                            mimetype: media.mimetype
                        }
                    });
                    
                    if (result.status === 'ok') {
                        let respuesta = `✅ *Factura registrada*\n\n`;
                        respuesta += `🏢 *${result.datos.proveedor}*\n`;
                        respuesta += `💰 *Total:* $${result.datos.total.toFixed(2)}\n`;
                        respuesta += `📂 *Categoría:* ${result.datos.categoria}\n`;
                        respuesta += `📅 *Fecha:* ${result.datos.fecha}\n\n`;
                        
                        if (result.analisis && result.analisis.insights && result.analisis.insights.length > 0) {
                            respuesta += `🔍 *Insights:*\n`;
                            result.analisis.insights.forEach(i => {
                                respuesta += `${i}\n`;
                            });
                            respuesta += '\n';
                        }
                        
                        respuesta += `📊 *"mis gastos"* para ver resumen`;
                        
                        await message.reply(respuesta);
                    } else if (result.status === 'duplicado') {
                        await message.reply('⚠️ *Factura duplicada*\n\nEsta factura ya fue registrada anteriormente.');
                    } else {
                        await message.reply('❌ Error al procesar la factura. Intenta de nuevo.');
                    }
                } catch (error) {
                    console.error('Error al procesar factura:', error);
                    await message.reply('❌ Error al procesar la factura. Asegúrate de que la imagen sea clara.');
                }
            }
            return;
        }
        
        // ─── SI NO ENTIENDE ───
        if (!texto.startsWith('presupuesto ')) {
            await message.reply(`🤖 No entendí ese comando.

*Comandos disponibles:*
📸 Envía *foto de factura* para registrarla
📊 *"mis gastos"* para ver resumen
📋 *"mis facturas"* para ver lista
💰 *"presupuesto [cat] [monto]"* para establecer
⚠️ *"alertas"* para ver alertas
🌐 *"web"* para abrir dashboard
❓ *"ayuda"* para ver todos los comandos`);
        }
        
    } catch (error) {
        console.error('Error general:', error);
    }
});

// ─── SERVIDOR WEB ───
app.use(express.static(publicDir));

app.get('/api/status', (req, res) => {
    res.json({ estado, qr: qrGenerado, timestamp: new Date().toISOString() });
});

app.get('/api/qr', async (req, res) => {
    if (!qrGenerado) return res.json({ qr: null, estado });
    try {
        const qrDataUrl = await qrcode.toDataURL(qrGenerado, {
            color: { dark: '#00F5FF', light: '#0A0A1A' },
            width: 400, margin: 2
        });
        res.json({ qr: qrDataUrl, estado });
    } catch (err) {
        res.status(500).json({ error: 'Error generando QR' });
    }
});

app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>InvoiceFlow — Conectar WhatsApp</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', sans-serif;
            background: #0A0A1A;
            color: #fff;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }
        .bg-grid {
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background-image: 
                linear-gradient(rgba(0, 245, 255, 0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(0, 245, 255, 0.03) 1px, transparent 1px);
            background-size: 60px 60px;
            z-index: 0;
        }
        .bg-glow {
            position: fixed;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            width: 600px; height: 600px;
            background: radial-gradient(circle, rgba(0, 245, 255, 0.06) 0%, transparent 70%);
            z-index: 0;
        }
        .container {
            position: relative;
            z-index: 1;
            text-align: center;
            padding: 20px;
            max-width: 500px;
            width: 100%;
        }
        .logo {
            font-size: 28px;
            font-weight: 800;
            background: linear-gradient(135deg, #00F5FF, #00D4FF);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 8px;
            letter-spacing: -0.5px;
        }
        .subtitle {
            color: rgba(255,255,255,0.5);
            font-size: 14px;
            font-weight: 300;
            margin-bottom: 40px;
        }
        .qr-card {
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(0, 245, 255, 0.1);
            border-radius: 24px;
            padding: 40px;
            backdrop-filter: blur(20px);
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            transition: all 0.3s ease;
        }
        .qr-card.loading { border-color: rgba(255,255,255,0.05); }
        .qr-card.connected {
            border-color: rgba(0, 255, 100, 0.3);
            background: rgba(0, 255, 100, 0.03);
        }
        .qr-container {
            width: 280px;
            height: 280px;
            margin: 0 auto 24px;
            border-radius: 16px;
            overflow: hidden;
            background: #0A0A1A;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid rgba(0, 245, 255, 0.15);
            position: relative;
        }
        .qr-container img { width: 100%; height: 100%; object-fit: contain; }
        .qr-placeholder { color: rgba(255,255,255,0.3); font-size: 14px; }
        .qr-spinner {
            width: 40px; height: 40px;
            border: 3px solid rgba(0, 245, 255, 0.1);
            border-top-color: #00F5FF;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .status {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-bottom: 16px;
            font-size: 14px;
        }
        .status-dot {
            width: 8px; height: 8px;
            border-radius: 50%;
            background: #666;
            animation: pulse 2s infinite;
        }
        .status-dot.waiting {
            background: #FFD700;
            box-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
        }
        .status-dot.connected {
            background: #00FF64;
            box-shadow: 0 0 10px rgba(0, 255, 100, 0.5);
        }
        .status-dot.error {
            background: #FF4444;
            box-shadow: 0 0 10px rgba(255, 68, 68, 0.5);
        }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .status-text { color: rgba(255,255,255,0.6); font-weight: 400; }
        .instructions {
            text-align: left;
            background: rgba(0, 245, 255, 0.03);
            border: 1px solid rgba(0, 245, 255, 0.08);
            border-radius: 16px;
            padding: 20px 24px;
            margin-top: 24px;
        }
        .instructions h3 {
            font-size: 13px;
            font-weight: 600;
            color: rgba(255,255,255,0.4);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 12px;
        }
        .instructions ol { list-style: none; counter-reset: step; }
        .instructions ol li {
            counter-increment: step;
            padding: 8px 0;
            font-size: 14px;
            color: rgba(255,255,255,0.7);
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .instructions ol li::before {
            content: counter(step);
            width: 24px; height: 24px;
            background: rgba(0, 245, 255, 0.1);
            border: 1px solid rgba(0, 245, 255, 0.2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 600;
            color: #00F5FF;
            flex-shrink: 0;
        }
        .connected-screen { display: none; }
        .connected-screen.active { display: block; }
        .check-icon {
            width: 80px; height: 80px;
            background: rgba(0, 255, 100, 0.1);
            border: 2px solid rgba(0, 255, 100, 0.3);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 20px;
            font-size: 36px;
        }
        .connected-title {
            font-size: 24px;
            font-weight: 700;
            color: #00FF64;
            margin-bottom: 8px;
        }
        .connected-sub {
            color: rgba(255,255,255,0.5);
            font-size: 14px;
            margin-bottom: 24px;
        }
        .connected-commands {
            text-align: left;
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 16px;
            padding: 20px 24px;
        }
        .connected-commands h3 {
            font-size: 13px;
            font-weight: 600;
            color: rgba(255,255,255,0.4);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 12px;
        }
        .cmd-item {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid rgba(255,255,255,0.05);
            font-size: 14px;
        }
        .cmd-item:last-child { border-bottom: none; }
        .cmd-name { color: #00F5FF; font-weight: 500; font-family: monospace; }
        .cmd-desc { color: rgba(255,255,255,0.5); }
        .footer { margin-top: 24px; color: rgba(255,255,255,0.2); font-size: 12px; }
    </style>
</head>
<body>
    <div class="bg-grid"></div>
    <div class="bg-glow"></div>
    
    <div class="container">
        <div class="logo">✦ InvoiceFlow</div>
        <div class="subtitle">Conecta tu WhatsApp al sistema financiero</div>
        
        <div class="qr-card" id="qrCard">
            <div id="qrSection">
                <div class="qr-container" id="qrContainer">
                    <div class="qr-spinner" id="qrSpinner"></div>
                    <img id="qrImage" style="display:none" alt="Código QR">
                    <div class="qr-placeholder" id="qrPlaceholder">Generando QR...</div>
                </div>
                
                <div class="status">
                    <div class="status-dot waiting" id="statusDot"></div>
                    <span class="status-text" id="statusText">Esperando escaneo...</span>
                </div>
                
                <div class="instructions">
                    <h3>📱 Cómo conectar</h3>
                    <ol>
                        <li>Abre WhatsApp en tu teléfono</li>
                        <li>Toca los 3 puntitos (⋮) → WhatsApp Web</li>
                        <li>Apunta la cámara al código QR</li>
                        <li>¡Listo! El bot se conectará automáticamente</li>
                    </ol>
                </div>
            </div>
            
            <div class="connected-screen" id="connectedScreen">
                <div class="check-icon">✓</div>
                <div class="connected-title">¡Conectado!</div>
                <div class="connected-sub">Tu WhatsApp está vinculado al sistema</div>
                
                <div class="connected-commands">
                    <h3>🤖 Comandos disponibles</h3>
                    <div class="cmd-item">
                        <span class="cmd-name">hola</span>
                        <span class="cmd-desc">Ver menú</span>
                    </div>
                    <div class="cmd-item">
                        <span class="cmd-name">mis gastos</span>
                        <span class="cmd-desc">Resumen financiero</span>
                    </div>
                    <div class="cmd-item">
                        <span class="cmd-name">📸 Foto factura</span>
                        <span class="cmd-desc">Registrar gasto</span>
                    </div>
                    <div class="cmd-item">
                        <span class="cmd-name">web</span>
                        <span class="cmd-desc">Abrir dashboard</span>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="footer">InvoiceFlow — Financial OS</div>
    </div>
    
    <script>
        async function checkStatus() {
            try {
                const res = await fetch('/api/qr');
                const data = await res.json();
                
                const qrCard = document.getElementById('qrCard');
                const qrSection = document.getElementById('qrSection');
                const connectedScreen = document.getElementById('connectedScreen');
                const qrImage = document.getElementById('qrImage');
                const qrSpinner = document.getElementById('qrSpinner');
                const qrPlaceholder = document.getElementById('qrPlaceholder');
                const statusDot = document.getElementById('statusDot');
                const statusText = document.getElementById('statusText');
                
                if (data.estado === 'conectado') {
                    qrCard.className = 'qr-card connected';
                    qrSection.style.display = 'none';
                    connectedScreen.classList.add('active');
                    statusDot.className = 'status-dot connected';
                    statusText.textContent = '✅ Conectado';
                    return;
                }
                
                if (data.qr) {
                    qrImage.src = data.qr;
                    qrImage.style.display = 'block';
                    qrSpinner.style.display = 'none';
                    qrPlaceholder.style.display = 'none';
                    qrCard.className = 'qr-card';
                    statusDot.className = 'status-dot waiting';
                    statusText.textContent = '📱 Escanea el QR con WhatsApp';
                } else {
                    qrImage.style.display = 'none';
                    qrSpinner.style.display = 'block';
                    qrPlaceholder.style.display = 'block';
                    qrCard.className = 'qr-card loading';
                    statusDot.className = 'status-dot';
                    statusText.textContent = '⏳ Generando QR...';
                }
            } catch (err) {
                console.error('Error:', err);
            }
        }
        
        checkStatus();
        setInterval(checkStatus, 2000);
    </script>
</body>
</html>`);
});

// ─── INICIAR ───
app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════╗
    ║     INVOICEFLOW — QR Server          ║
    ║                                      ║
    ║  🌐 Abre en tu navegador:            ║
    ║  → http://localhost:${PORT}            ║
    ║                                      ║
    ║  📱 Escanea el QR con WhatsApp       ║
    ║  💬 El bot procesa mensajes          ║
    ╚══════════════════════════════════════╝
    `);
});

client.initialize();
