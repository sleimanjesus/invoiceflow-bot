/**
 * INVOICEFLOW — Bot de WhatsApp v3.0
 * 
 * ✅ Solo escucha en el chat PRIVADO del dueño (contigo mismo)
 * ✅ Usa prefijo "bot" para activar comandos (ej: "bot hola", "bot facturas")
 * ✅ Menú interactivo con números (respondes "1", "2", etc.)
 * ✅ Anti-loop: no responde sus propias respuestas
 * ✅ Procesa fotos de facturas
 * ✅ Todos los comandos financieros funcionan
 * ✅ Servidor QR incluido en http://localhost:3000
 * ✅ Reconexión automática si se cae la conexión
 * 
 * CÓMO USAR:
 * 1. npm install
 * 2. node bot-final.js
 * 3. Escanea QR en http://localhost:3000
 * 4. En WhatsApp, ve a TU PROPIO CHAT y escribe "bot hola"
 * 5. ¡El bot solo te responde a TI en privado!
 */

const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const https = require('https');
const path = require('path');
const fs = require('fs');

// ─── CONFIGURACIÓN ───────────────────────────────────────────
const API_URL = 'https://invoiceflow-jj1p.onrender.com';
const OWNER_NUMBER = '584128048173'; // Tu número sin +
const OWNER_NAME = 'Sleiman'; // Tu nombre
const BOT_NAME = 'InvoiceFlow Bot';
const PORT = 3000;

// ─── SERVIDOR EXPRESS ────────────────────────────────────────
const app = express();
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);

// ─── VARIABLES GLOBALES ──────────────────────────────────────
let qrGenerado = null;
let estado = 'conectando';
let client = null;

// ─── FUNCIONES AUXILIARES ────────────────────────────────────

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

function getChatPrivadoId() {
    return `${OWNER_NUMBER}@c.us`;
}

// ─── MENÚ PRINCIPAL ──────────────────────────────────────────
function getMenuPrincipal() {
    return `🤖 *${BOT_NAME}*
¡Hola, ${OWNER_NAME}! 👋

*¿Qué deseas hacer?*

1️⃣ 📊 *Ver mis gastos*
2️⃣ 📋 *Ver mis facturas*
3️⃣ 💰 *Establecer presupuesto*
4️⃣ ⚠️ *Ver alertas*
5️⃣ 🌐 *Abrir dashboard web*
6️⃣ 📸 *Registrar factura* (envía foto)

━━━━━━━━━━━━━━━━━━━━━
Responde con el *número* (ej: "1")
o escribe *"bot [comando]"*

Ej: *"bot facturas"*, *"bot gastos"*
`;
}

// ─── FUNCIÓN PARA RESPONDER EN EL CHAT PRIVADO ──────────────
async function responder(mensaje) {
    try {
        if (!client) return;
        const chatId = getChatPrivadoId();
        await client.sendMessage(chatId, mensaje);
        console.log(`📤 Bot respondió`);
    } catch (error) {
        console.error('❌ Error al responder:', error);
    }
}

// ─── FUNCIÓN PARA INICIAR EL CLIENTE DE WHATSAPP ─────────────
function iniciarCliente() {
    if (client) {
        try { client.destroy(); } catch(e) {}
        client = null;
    }

    client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
        }
    });

    // ─── EVENTOS DEL CLIENTE ─────────────────────────────────
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
        console.log('\n═══════════════════════════════════════════');
        console.log('  ✅ ¡BOT CONECTADO!');
        console.log(`  📱 ${BOT_NAME} v3.0`);
        console.log('  💬 Escribe "bot hola" en tu chat privado');
        console.log('  🔒 Solo responde en tu chat privado');
        console.log('═══════════════════════════════════════════\n');
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
        console.log('🔄 Reintentando conexión en 5 segundos...');
        setTimeout(() => {
            console.log('🔄 Reconectando...');
            iniciarCliente();
        }, 5000);
    });

    // ─── PROCESAR MENSAJES (SOLO CHAT PRIVADO DEL DUEÑO) ────
    client.on('message_create', async (msg) => {
        try {
            // SOLO procesar mensajes del chat privado del dueño
            if (msg.from !== getChatPrivadoId()) return;
            
            // Ignorar estados
            if (msg.from === 'status@broadcast') return;
            
            // ANTI-LOOP: ignorar mensajes que nosotros mismos enviamos (respuestas del bot)
            if (msg.fromMe && msg.body) {
                const texto = msg.body.toLowerCase().trim();
                const emojisRespuesta = ['✅', '📊', '📋', '💰', '⚠️', '🌐', '❓', '🤖', '📸', '🚨', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];
                if (emojisRespuesta.some(emoji => texto.startsWith(emoji))) return;
            }
            
            const texto = (msg.body || '').toLowerCase().trim();
            if (!texto) return;
            
            console.log(`📩 Mensaje en chat privado: "${texto.substring(0, 50)}"`);
            await client.sendSeen(msg.from);
            
    // ─── VARIABLE PARA ESTADO DE MENÚ ────────────────
    // Si el usuario responde solo un número, lo tratamos como selección de menú
    const esNumero = /^[1-6]$/.test(texto);
    
    // ─── COMANDOS CON PREFIJO "bot" ──────────────────
    const esComandoBot = texto.startsWith('bot ');
    let comando = '';
    if (esComandoBot) {
        comando = texto.replace('bot ', '').trim();
    }
    
    // ─── PROCESAR COMANDOS ───────────────────────────
    
    // Si es un número solo (respuesta al menú interactivo)
    if (esNumero) {
        const num = parseInt(texto);
        switch(num) {
            case 1: await procesarGastos(msg); break;
            case 2: await procesarFacturas(msg); break;
            case 3: await responder('💰 *Presupuesto*\n\nEscribe: *"bot presupuesto [categoría] [monto]"*\n\nEj: *"bot presupuesto alimentos 500"*'); break;
            case 4: await procesarAlertas(msg); break;
            case 5: await procesarWeb(msg); break;
            case 6: await responder('📸 *Registrar factura*\n\nSolo envía una *foto* de tu factura y yo la proceso automáticamente 🤖'); break;
        }
        return;
    }
    
    // Comandos con prefijo "bot"
    if (esComandoBot) {
        if (comando === 'hola' || comando === 'menu' || comando === 'ayuda' || comando === 'start' || comando === 'comandos') {
            await responder(getMenuPrincipal());
        }
        else if (comando === 'gastos' || comando === 'gasto' || comando === 'resumen' || comando === '1') {
            await procesarGastos(msg);
        }
        else if (comando === 'facturas' || comando === 'factura' || comando === 'ultimas' || comando === '2') {
            await procesarFacturas(msg);
        }
        else if (comando.startsWith('presupuesto ') || comando === 'presupuesto' || comando === '3') {
            if (comando === 'presupuesto' || comando === '3') {
                await responder('💰 *Presupuesto*\n\nEscribe: *"bot presupuesto [categoría] [monto]"*\n\nEj: *"bot presupuesto alimentos 500"*');
            } else {
                await procesarPresupuesto(msg, comando.replace('presupuesto ', '').trim());
            }
        }
        else if (comando === 'alertas' || comando === 'alerta' || comando === '4') {
            await procesarAlertas(msg);
        }
        else if (comando === 'web' || comando === 'dashboard' || comando === 'sitio' || comando === '5') {
            await procesarWeb(msg);
        }
        else if (comando === 'foto' || comando === 'facturafoto' || comando === '6') {
            await responder('📸 *Registrar factura*\n\nSolo envía una *foto* de tu factura y yo la proceso automáticamente 🤖');
        }
        else if (comando === 'borrar todo' || comando === 'reset' || comando === 'limpiar') {
            try {
                await hacerPeticion(`${API_URL}/api/invoices/clear-all`, { method: 'DELETE' });
                await responder('🗑️ *Todos los datos han sido eliminados*\n\nAhora puedes empezar desde cero. Envía una foto de tu primera factura 📸');
            } catch {
                await responder('❌ Error al borrar los datos. Intenta de nuevo.');
            }
        }
        else if (comando === 'exportar' || comando === 'sheets' || comando === 'excel') {
            await responder('📊 *Exportar a Google Sheets*\n\nEsta función estará disponible próximamente. 🚧');
        }
        else {
            await responder(`🤖 No entendí *"${comando}"*\n\nEscribe *"bot hola"* para ver el menú de opciones.`);
        }
        return;
    }
    
    // ─── SI EL MENSAJE ES SOLO "hola" SIN PREFIJO ───
    if (texto === 'hola' || texto === 'menu' || texto === 'ayuda' || texto === 'help') {
        await responder(getMenuPrincipal());
        return;
    }
    
    // ─── SI EL MENSAJE ES "mis gastos" SIN PREFIJO ───
    if (texto === 'mis gastos' || texto === 'gastos' || texto === 'resumen') {
        await procesarGastos(msg);
        return;
    }
    
    // ─── SI EL MENSAJE ES "mis facturas" SIN PREFIJO ───
    if (texto === 'mis facturas' || texto === 'facturas' || texto === 'ultimas') {
        await procesarFacturas(msg);
        return;
    }
    
    // ─── SI EL MENSAJE ES "alertas" SIN PREFIJO ───
    if (texto === 'alertas' || texto === 'alerta') {
        await procesarAlertas(msg);
        return;
    }
    
    // ─── SI EL MENSAJE ES "web" SIN PREFIJO ───
    if (texto === 'web' || texto === 'dashboard' || texto === 'sitio') {
        await procesarWeb(msg);
        return;
    }
    
    // ─── SI EL MENSAJE ES "presupuesto" SIN PREFIJO ───
    if (texto.startsWith('presupuesto ')) {
        await procesarPresupuesto(msg, texto.replace('presupuesto ', '').trim());
        return;
    }
            
            // ─── SI ES UNA IMAGEN (FACTURA) ─────────────────
            if (msg.hasMedia) {
                const media = await msg.downloadMedia();
                
                if (media.mimetype && media.mimetype.startsWith('image/')) {
                    await responder('📸 *Procesando factura...*\n\n⏳ Un momento por favor...');
                    
                    try {
                        const result = await hacerPeticion(`${API_URL}/api/invoices/upload-base64`, {
                            method: 'POST',
                            body: {
                                imagen: media.data,
                                mimetype: media.mimetype
                            }
                        });
                        
                        let respuesta;
                        if (result.status === 'ok') {
                            respuesta = `✅ *Factura registrada*\n\n`;
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
                            
                            respuesta += `📊 *"bot gastos"* para ver resumen`;
                        } else if (result.status === 'duplicado') {
                            respuesta = '⚠️ *Factura duplicada*\n\nEsta factura ya fue registrada anteriormente.';
                        } else {
                            respuesta = '❌ Error al procesar la factura. Intenta de nuevo.';
                        }
                        
                        await responder(respuesta);
                    } catch (error) {
                        console.error('Error al procesar factura:', error);
                        await responder('❌ Error al procesar la factura. Asegúrate de que la imagen sea clara.');
                    }
                }
                return;
            }
            
            // ─── SI NO ES NADA RECONOCIDO ───────────────────
            // Solo mostrar menú si no es un comando vacío
            if (texto.length > 0) {
                await responder(`🤖 No entendí ese mensaje.\n\nEscribe *"bot hola"* para ver el menú de opciones.`);
            }
            
        } catch (error) {
            console.error('Error general:', error);
        }
    });

    // ─── FUNCIONES DE PROCESAMIENTO ──────────────────────────
    
    async function procesarGastos(msg) {
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
            
            const respuesta = `📊 *Resumen Financiero*

💰 *Total gastado:* $${stats.total_gastado.toFixed(2)}
📄 *Facturas:* ${stats.total_facturas}
📈 *Promedio:* $${stats.promedio.toFixed(2)}

*Por categoría:*
${categorias}

━━━━━━━━━━━━━━━━━━━━━
📸 *Envía una foto* de tu factura para registrar un nuevo gasto
🔙 *"bot hola"* para volver al menú`;
            
            await responder(respuesta);
        } catch (error) {
            await responder('❌ Error al consultar tus gastos. Intenta de nuevo.');
        }
    }
    
    async function procesarFacturas(msg) {
        try {
            const facturas = await hacerPeticion(`${API_URL}/api/invoices`);
            
            if (!facturas || facturas.length === 0) {
                await responder('📋 *No tienes facturas registradas aún*\n\nEnvía una foto de tu factura para empezar.');
                return;
            }
            
            const ultimas = facturas.slice(0, 5);
            let lista = ultimas.map((f, i) => 
                `${i+1}. *${f.proveedor}* - $${f.total.toFixed(2)}\n   📅 ${f.fecha} | ${f.categoria}`
            ).join('\n\n');
            
            const respuesta = `📋 *Últimas ${Math.min(5, facturas.length)} facturas:*\n\n${lista}\n\n━━━━━━━━━━━━━━━━━━━━━\n📊 *"bot gastos"* para ver resumen completo\n🔙 *"bot hola"* para volver al menú`;
            await responder(respuesta);
        } catch (error) {
            await responder('❌ Error al consultar facturas.');
        }
    }
    
    async function procesarPresupuesto(msg, texto) {
        const partes = texto.split(' ');
        if (partes.length >= 2) {
            const categoria = partes.slice(0, -1).join(' ');
            const monto = parseFloat(partes[partes.length - 1]);
            
            if (!isNaN(monto) && monto > 0) {
                try {
                    await hacerPeticion(`${API_URL}/api/budgets`, {
                        method: 'POST',
                        body: { categoria, limite: monto }
                    });
                    await responder(`💰 *Presupuesto actualizado*\n\n${categoria}: $${monto.toFixed(2)}/mes\n\n🔙 *"bot hola"* para volver al menú`);
                } catch {
                    await responder('❌ Error al establecer presupuesto.');
                }
                return;
            }
        }
        await responder('❌ Formato: *"bot presupuesto [categoría] [monto]"*\n\nEj: *"bot presupuesto alimentos 500"*');
    }
    
    async function procesarAlertas(msg) {
        try {
            const alerts = await hacerPeticion(`${API_URL}/api/alerts`);
            
            let respuesta;
            if (!alerts || alerts.length === 0) {
                respuesta = '✅ *No hay alertas*\n\nTus presupuestos están en orden.';
            } else {
                let lista = alerts.map(a => 
                    `⚠️ *${a.categoria}*: $${a.gastado.toFixed(2)} de $${a.limite.toFixed(2)}`
                ).join('\n');
                respuesta = `🚨 *Alertas de Presupuesto*\n\n${lista}\n\n💰 Usa *"bot presupuesto [cat] [monto]"* para ajustar\n🔙 *"bot hola"* para volver al menú`;
            }
            
            await responder(respuesta);
        } catch {
            await responder('❌ Error al consultar alertas.');
        }
    }
    
    async function procesarWeb(msg) {
        await responder(`🌐 *Dashboard Financiero*
        
Abre este enlace en tu navegador:
${API_URL}

📊 Ahí puedes ver:
• Todos tus gastos en gráficos
• Facturas registradas
• Alertas de presupuesto
• Estadísticas mensuales

🔙 *"bot hola"* para volver al menú`);
    }

    client.initialize();
}

// ─── SERVIDOR WEB (QR + Estado) ──────────────────────────────
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
    <title>InvoiceFlow — Bot de WhatsApp</title>
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
        .security-badge {
            margin-top: 16px;
            padding: 12px 16px;
            background: rgba(0, 245, 255, 0.05);
            border: 1px solid rgba(0, 245, 255, 0.1);
            border-radius: 12px;
            font-size: 13px;
            color: rgba(255,255,255,0.6);
        }
        .security-badge strong { color: #00F5FF; }
        .footer { margin-top: 24px; color: rgba(255,255,255,0.2); font-size: 12px; }
    </style>
</head>
<body>
    <div class="bg-grid"></div>
    <div class="bg-glow"></div>
    
    <div class="container">
        <div class="logo">✦ InvoiceFlow</div>
        <div class="subtitle">Bot de WhatsApp v3.0 — Escribe "bot hola" en tu chat 🔒</div>
        
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
                
                <div class="security-badge">
                    🔒 <strong>Privacidad total:</strong> El bot solo escucha en TU chat privado.
                    Escribe <strong>"bot hola"</strong> en tu propio chat para empezar.
                    ¡Nadie más ve las respuestas!
                </div>
            </div>
            
            <div class="connected-screen" id="connectedScreen">
                <div class="check-icon">✓</div>
                <div class="connected-title">¡Conectado!</div>
                <div class="connected-sub">Tu WhatsApp está vinculado al sistema</div>
                
                <div class="connected-commands">
                    <h3>🤖 Comandos disponibles</h3>
                    <div class="cmd-item">
                        <span class="cmd-name">bot hola</span>
                        <span class="cmd-desc">Ver menú completo</span>
                    </div>
                    <div class="cmd-item">
                        <span class="cmd-name">bot gastos</span>
                        <span class="cmd-desc">Resumen financiero</span>
                    </div>
                    <div class="cmd-item">
                        <span class="cmd-name">bot facturas</span>
                        <span class="cmd-desc">Lista de facturas</span>
                    </div>
                    <div class="cmd-item">
                        <span class="cmd-name">📸 Foto factura</span>
                        <span class="cmd-desc">Registrar gasto</span>
                    </div>
                    <div class="cmd-item">
                        <span class="cmd-name">bot presupuesto</span>
                        <span class="cmd-desc">Establecer presupuesto</span>
                    </div>
                    <div class="cmd-item">
                        <span class="cmd-name">bot alertas</span>
                        <span class="cmd-desc">Alertas de presupuesto</span>
                    </div>
                    <div class="cmd-item">
                        <span class="cmd-name">bot web</span>
                        <span class="cmd-desc">Abrir dashboard</span>
                    </div>
                </div>
                
                <div class="security-badge">
                    🔒 <strong>Modo privado activo:</strong> El bot solo responde en TU chat.
                    Escribe <strong>"bot hola"</strong> en tu propio chat para empezar.
                </div>
            </div>
        </div>
        
        <div class="footer">InvoiceFlow v3.0 — Chat Privado 🔒</div>
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

// ─── INICIAR ──────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════╗
    ║     INVOICEFLOW — Bot v3.0           ║
    ║                                      ║
    ║  🌐 Abre en tu navegador:            ║
    ║  → http://localhost:${PORT}            ║
    ║                                      ║
    ║  📱 Escanea el QR con WhatsApp       ║
    ║  💬 Escribe "bot hola" en tu chat    ║
    ║  🔒 Solo responde en tu chat privado ║
    ║  🔄 Reconexión automática            ║
    ╚══════════════════════════════════════╝
    `);
});

// Iniciar el cliente de WhatsApp
iniciarCliente();
   