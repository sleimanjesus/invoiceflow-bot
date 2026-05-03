#!/usr/bin/env node

/**
 * INVOICEFLOW — Script principal que levanta API + Bots
 * 
 * Este script:
 *   1. Inicia el servidor Express (API REST + panel web)
 *   2. Llama a botManager.startAllBots() para iniciar todos los bots activos
 * 
 * Es el entry point para producción con PM2.
 * 
 * Uso:
 *   node scripts/apiWithBots.js
 *   npm start
 *   npm run deploy  (con PM2)
 */

const path = require('path');

// ─── Configurar variables de entorno por defecto ──────────────
process.env.PORT = process.env.PORT || '3000';
process.env.API_URL = process.env.API_URL || 'http://localhost:8000';

console.log(`
    ╔══════════════════════════════════════════════════╗
    ║          INVOICEFLOW — Iniciando Sistema         ║
    ╠══════════════════════════════════════════════════╣
    ║  📡 API URL: ${process.env.API_URL.padEnd(35)}║
    ║  🌐 Puerto:  ${process.env.PORT.padEnd(35)}║
    ║  🏢 Entorno: ${(process.env.NODE_ENV || 'development').padEnd(35)}║
    ╚══════════════════════════════════════════════════╝
`);

// ─── Iniciar servidor Express (API + panel web) ──────────────
// El server.js ya importa botManager y llama a startAllBots()
// al final del archivo después de app.listen()
require('../bot-whatsapp/server.js');
