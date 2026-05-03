/**
 * INVOICEFLOW — Configuración de PM2 para producción
 * 
 * Uso:
 *   npm run deploy    → pm2 start ecosystem.config.js
 *   npm run logs      → pm2 logs invoiceflow
 *   npm run stop      → pm2 stop invoiceflow
 * 
 * Requisito: npm i -g pm2
 */

module.exports = {
  apps: [{
    name: 'invoiceflow',
    script: 'scripts/apiWithBots.js',
    watch: ['src'],
    ignore_watch: ['node_modules', 'auth_*', 'sessions'],
    max_restarts: 10,
    min_uptime: 10000,
    max_memory_restart: '250M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
