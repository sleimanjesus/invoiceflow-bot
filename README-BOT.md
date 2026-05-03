# 🤖 INVOICEFLOW — Bot de WhatsApp v4.0 (SaaS Multi-Empresa)

## 📋 INFORMACIÓN GENERAL

| Dato | Valor |
|------|-------|
| **Nombre** | InvoiceFlow Bot v4.0 |
| **Tecnología** | whatsapp-web.js + Node.js + Supabase (PostgreSQL) |
| **Servidor** | Local (PC) — Puerto 3000 |
| **API** | Integrada (Express) — **Ya no necesita Python** |
| **Base de Datos** | Supabase (PostgreSQL) — **Reemplaza SQLite** |
| **Estado** | ✅ Autónomo |

---

## 🚀 CÓMO INICIAR EL SISTEMA

### 🖥️ Desarrollo (local)

```bash
cd C:\Users\pc\Documents\Desarrollo\invoiceflow\bot-whatsapp
npm start
```

Esto inicia:
- ✅ **API REST** completa (empresas, facturas, presupuestos, comandos)
- ✅ **Gestor de bots** multi-empresa
- ✅ **Panel web** de administración
- ✅ **Dashboard** financiero

Luego abre en el navegador: **http://localhost:3000**

### 🚀 Producción (con PM2)

```bash
# 1. Instalar PM2 globalmente (solo una vez)
npm i -g pm2

# 2. Iniciar el bot con PM2
cd C:\Users\pc\Documents\Desarrollo\invoiceflow\bot-whatsapp
npm run deploy

# 3. Ver los logs
npm run logs

# 4. Otros comandos útiles
npm run stop      # Detener el bot
npm run restart   # Reiniciar el bot
```

PM2 mantiene el bot corriendo en segundo plano y lo reinicia automáticamente si falla.

---

## 🏗️ ARQUITECTURA (NUEVA)

```
┌─────────────────────────────────────────────────┐
│              server.js (Express)                 │
│  ┌───────────────────────────────────────────┐  │
│  │  API REST (src/api/routes.js)             │  │
│  │  - /api/admin/empresas (CRUD)             │  │
│  │  - /api/empresas/:id/invoices             │  │
│  │  - /api/empresas/:id/budgets              │  │
│  │  - /api/empresas/:id/comandos             │  │
│  │  - /api/bot/:id/config                    │  │
│  │  - /health                                │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │  Bot Manager (src/bot/botManager.js)      │  │
│  │  - startBot(empresaId)                    │  │
│  │  - stopBot(empresaId)                     │  │
│  │  - getStatus(empresaId)                   │  │
│  │  - startAllBots()                         │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │  Supabase (src/api/database.js)           │  │
│  │  - PostgreSQL en la nube                  │  │
│  │  - empresas, clientes, invoices           │  │
│  │  - budgets, comandos_personalizados       │  │
│  │  - bots_config, registros_formularios     │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │  Web (templates/admin.html)               │  │
│  │  - Panel de administración                │  │
│  │  - Gestión de empresas                    │  │
│  │  - Control de bots                        │  │
│  │  - Comandos personalizados                │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**¡Ya no necesitas Python/FastAPI!** Todo corre en un solo proceso Node.js.

---

## 🔒 MODO PRIVADO (MULTI-EMPRESA)

Cada bot responde **SOLO al dueño de la empresa** (configurado por número de WhatsApp).

- ✅ Cada empresa tiene su propio bot
- ✅ Cada bot responde solo al número configurado
- ✅ Las respuestas van al chat privado del dueño
- ✅ Anti-loop: no responde a sus propias respuestas

---

## 📱 COMANDOS DEL BOT

| Comando | Descripción |
|---------|-------------|
| `hola` / `ayuda` / `menu` | Ver todos los comandos |
| `mis facturas` / `facturas` | Lista tus últimas 5 facturas |
| `mis gastos` / `gastos` / `resumen` | Resumen financiero del mes |
| `presupuesto [cat] [monto]` | Ej: "presupuesto alimentos 500" |
| `alertas` / `alerta` | Alertas de presupuesto |
| `web` / `dashboard` / `sitio` | Enlace al dashboard web |
| 📸 **Enviar foto de factura** | Registra automáticamente el gasto |

### Comandos Personalizados

Puedes crear comandos personalizados desde el panel de administración:
- **Simples**: Responden un mensaje fijo
- **Formularios**: Guían al usuario paso a paso para recolectar datos

---

## 🔧 ARCHIVOS DEL SISTEMA

| Archivo | Descripción |
|---------|-------------|
| **`server.js`** | ✅ **Servidor único (API + Bots + Web)** |
| `src/bot/botManager.js` | Gestor de bots multi-empresa |
| `src/api/database.js` | Base de datos Supabase (PostgreSQL) |
| `src/api/routes.js` | Rutas de la API REST |
| `templates/admin.html` | Panel de administración web |
| `bot-multi-empresa.js` | Bot legacy (no usar) |
| `bot-final.js` | Bot legacy (no usar) |

---

## 📊 ENDPOINTS DE LA API

### Administración
- `GET /api/admin/empresas` — Listar empresas
- `POST /api/admin/empresas` — Crear empresa
- `GET /api/admin/empresas/:id` — Detalle de empresa
- `PUT /api/admin/empresas/:id` — Actualizar empresa
- `DELETE /api/admin/empresas/:id` — Eliminar empresa

### Clientes
- `GET /api/admin/empresas/:id/clientes` — Listar clientes
- `POST /api/admin/empresas/:id/clientes` — Crear cliente

### Facturas
- `GET /api/empresas/:id/invoices` — Listar facturas
- `GET /api/empresas/:id/invoices/stats` — Estadísticas
- `POST /api/empresas/:id/invoices/upload` — Subir factura
- `POST /api/empresas/:id/invoices/upload-base64` — Subir por base64

### Presupuestos
- `POST /api/empresas/:id/budgets` — Establecer presupuesto
- `GET /api/empresas/:id/alerts` — Alertas de presupuesto

### Comandos Personalizados
- `GET /api/empresas/:id/comandos` — Listar comandos
- `POST /api/empresas/:id/comandos` — Crear comando
- `PUT /api/empresas/:id/comandos/:cmdId` — Actualizar comando
- `DELETE /api/empresas/:id/comandos/:cmdId` — Eliminar comando

### Bots
- `GET /api/bots/status` — Estado de todos los bots
- `GET /api/bots/status/:id` — Estado de un bot
- `POST /api/bots/start/:id` — Iniciar bot
- `POST /api/bots/stop/:id` — Detener bot
- `POST /api/bots/start-all` — Iniciar todos
- `GET /api/bots/:id/qr` — QR de un bot

### Health
- `GET /health` — Health check

---

## 🛑 DETENER EL SISTEMA

```bash
taskkill /f /im node.exe
```

O simplemente cierra la terminal.

---

## 🔄 REINICIAR (NUEVO QR)

```bash
cd C:\Users\pc\Documents\Desarrollo\invoiceflow\bot-whatsapp
rmdir /s /q sessions
npm start
```

---

## ⚠️ NOTAS IMPORTANTES

- ✅ **Cada bot responde SOLO al dueño de su empresa**
- ✅ **Ya no necesitas Python/FastAPI** — todo es Node.js
- ✅ **Base de datos Supabase (PostgreSQL)** — en la nube, accesible desde cualquier lugar
- ✅ **Migración SQL incluida** — pega `supabase-migration.sql` en el SQL Editor de Supabase
- ✅ **Anti-loop**: no se responde a sí mismo
- ✅ **Reconexión automática** con backoff exponencial
- ⚠️ Para que funcione 24/7, la PC debe estar encendida
- 💡 Para VPS: Oracle Cloud (siempre gratis) o cualquier VPS con Node.js
