/**
 * TEST BOT v7 — Te responde a TI cuando le escribes
 * Usa message_create para capturar TODOS los mensajes
 * Anti-loop: solo responde si NO es una respuesta del bot
 */
const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

let qrGenerado = null;
let estado = 'conectando';
let ultimoRespondido = ''; // Anti-loop

client.on('qr', async (qr) => {
    qrGenerado = qr;
    estado = 'esperando_escaneo';
    await qrcode.toFile(path.join(publicDir, 'qr.png'), qr, {
        color: { dark: '#00F5FF', light: '#0A0A1A' }, width: 400, margin: 2
    });
    console.log('✅ QR generado');
});

client.on('ready', () => {
    estado = 'conectado';
    qrGenerado = null;
    console.log('\n✅ ¡BOT CONECTADO!');
    console.log('💬 Escríbele "hola" a tu propio número\n');
});

client.on('authenticated', () => console.log('✅ Autenticado'));

// message_create captura TODOS los mensajes (tuyos incluidos)
client.on('message_create', async (msg) => {
    try {
        // Ignorar estados
        if (msg.from === 'status@broadcast') return;
        // Ignorar grupos
        if (msg.from.endsWith('@g.us')) return;
        
        const texto = msg.body.toLowerCase().trim();
        if (!texto) return;
        
        // ANTI-LOOP: Si el mensaje empieza con "✅" o "Recibí:", es del bot, lo ignoramos
        if (texto.startsWith('✅') || texto.startsWith('recibí:')) return;
        
        // ANTI-LOOP: Si ya respondimos este mismo texto, lo ignoramos
        if (texto === ultimoRespondido) return;
        
        console.log(`📩 "${texto}"`);
        ultimoRespondido = texto;
        
        if (texto === 'hola') {
            await msg.reply('✅ Hola! El bot te responde. 🎉');
        } else {
            await msg.reply(`Recibí: "${msg.body}"`);
        }
    } catch (err) {
        console.error('Error:', err.message);
    }
});

// Servidor web
app.use(express.static(publicDir));
app.get('/api/qr', async (req, res) => {
    if (!qrGenerado) return res.json({ qr: null, estado });
    const qrDataUrl = await qrcode.toDataURL(qrGenerado, {
        color: { dark: '#00F5FF', light: '#0A0A1A' }, width: 400, margin: 2
    });
    res.json({ qr: qrDataUrl, estado });
});
app.get('/', (req, res) => res.send(`
<!DOCTYPE html><html><head><title>Test Bot</title>
<style>body{background:#0A0A1A;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.container{text-align:center;padding:20px}
h1{color:#00F5FF}
.qr{width:280px;height:280px;margin:20px auto;border:2px solid #00F5FF33;border-radius:16px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.qr img{width:100%}
.status{color:#00FF64;font-size:18px}
</style></head><body>
<div class="container">
<h1>✦ InvoiceFlow Test</h1>
<div class="qr"><img id="qrImage" src="/qr.png" alt="QR"></div>
<div class="status" id="status">Conectando...</div>
</div>
<script>
async function check(){try{
const r=await fetch('/api/qr');const d=await r.json();
if(d.estado==='conectado')document.getElementById('status').textContent='✅ Conectado';
else document.getElementById('status').textContent='📱 Escanea el QR';
}catch(e){}}
check();setInterval(check,2000);
</script></body></html>`));

app.listen(PORT, () => console.log(`\n🌐 http://localhost:${PORT}\n`));
client.initialize();
