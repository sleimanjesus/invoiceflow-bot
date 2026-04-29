/**
 * INVOICEFLOW — Bot de WhatsApp
 * 
 * Este bot se conecta a tu WhatsApp y permite a tus clientes:
 * 1. Enviar fotos de facturas → se registran automáticamente
 * 2. Consultar "mis gastos" → reciben resumen
 * 3. Recibir alertas de presupuesto
 * 
 * Todo se sincroniza con el dashboard web en Render.
 * 
 * CÓMO USAR:
 * 1. npm install
 * 2. node bot.js
 * 3. Escanea el código QR con tu WhatsApp
 * 4. ¡Listo! El bot ya funciona
 */

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const https = require('https');

// ─── CONFIGURACIÓN ───────────────────────────────────────────
// CAMBIA ESTA URL por la de tu web en Render
const API_URL = 'https://invoiceflow-jj1p.onrender.com';

// Número de teléfono del dueño (TÚ) - formato internacional sin +
// Ejemplo: 584121234567 (Venezuela)
const OWNER_NUMBER = '584128048173';

// ─── CLIENTE WHATSAPP ────────────────────────────────────────
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// ─── QR CODE ─────────────────────────────────────────────────
client.on('qr', (qr) => {
    console.log('\n═══════════════════════════════════════════');
    console.log('  📱 ESCANEA ESTE CÓDIGO QR CON WHATSAPP');
    console.log('  Abre WhatsApp → 3 puntitos → WhatsApp Web');
    console.log('═══════════════════════════════════════════\n');
    qrcode.generate(qr, { small: true });
    console.log('\n⏳ Esperando escaneo...');
});

client.on('ready', () => {
    console.log('\n✅ ¡BOT CONECTADO!');
    console.log('📱 InvoiceFlow Bot está funcionando');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});

client.on('authenticated', () => {
    console.log('✅ Autenticado correctamente');
});

client.on('auth_failure', (msg) => {
    console.error('❌ Error de autenticación:', msg);
});

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
                try {
                    resolve(JSON.parse(body));
                } catch {
                    resolve(body);
                }
            });
        });
        
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

function descargarImagen(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject);
    });
}

// ─── MENSAJES DEL BOT ────────────────────────────────────────

client.on('message', async (message) => {
    try {
        const texto = message.body.toLowerCase().trim();
        const from = message.from;
        const isOwner = from.includes(OWNER_NUMBER);
        
        console.log(`📩 Mensaje de ${from}: ${texto.substring(0, 50)}`);
        
        // ─── COMANDOS ────────────────────────────────────────
        
        // Comando: ayuda
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
        
        // Comando: web
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
        
        // Comando: mis gastos
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
        
        // Comando: mis facturas
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
        
        // Comando: alertas
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
                
                await message.reply(`🚨 *Alertas de Presupuesto*\n\n${lista}\n\n💰 Usa *"presupuesto [categoría] [monto]"* para ajustar`);
            } catch {
                await message.reply('❌ Error al consultar alertas.');
            }
            return;
        }
        
        // Comando: presupuesto
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
        
        // ─── SI ES UNA IMAGEN (FACTURA) ─────────────────────
        if (message.hasMedia) {
            const media = await message.downloadMedia();
            
            if (media.mimetype && media.mimetype.startsWith('image/')) {
                await message.reply('📸 *Procesando factura...*\n\n⏳ Un momento por favor...');
                
                try {
                    // Enviar la imagen a la API de InvoiceFlow
                    const result = await hacerPeticion(`${API_URL}/api/invoices/upload`, {
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
        
        // ─── SI NO ENTIENDE EL MENSAJE ──────────────────────
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

// ─── INICIAR BOT ─────────────────────────────────────────────
console.log('═══════════════════════════════════════════');
console.log('  🚀 INVOICEFLOW - Bot de WhatsApp');
console.log('  Sistema de Facturación Inteligente');
console.log('═══════════════════════════════════════════\n');
console.log('📡 Conectando...');

client.initialize();
