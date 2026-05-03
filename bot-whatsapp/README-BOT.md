# 🤖 InvoiceFlow Bot v3.0 — WhatsApp

Bot de WhatsApp para gestionar tus facturas y gastos de forma **privada y segura**.

## 🆕 Novedades v3.0

- ✅ **Prefijo "bot"** — Todos los comandos empiezan con "bot" (ej: `bot hola`, `bot facturas`)
- ✅ **Menú interactivo** — Responde con números (1, 2, 3...) para navegar
- ✅ **Solo chat privado** — El bot solo escucha en TU chat personal (contigo mismo)
- ✅ **Privacidad total** — Nadie más ve las respuestas del bot
- ✅ **Reconexión automática** — Si se cae, se reconecta solo

## 📋 Cómo usar

### 1. Iniciar el bot
```bash
cd C:\Users\pc\Desktop\invoiceflow\bot-whatsapp
npm install
node bot-final.js
```

### 2. Escanear QR
Abre http://localhost:3000 y escanea el código QR con WhatsApp.

### 3. ¡A usarlo!
En WhatsApp, ve a **TU PROPIO CHAT** (donde te escribes a ti mismo) y escribe:

```
bot hola
```

El bot te mostrará un menú con opciones numeradas. Solo responde con el número.

## 📖 Comandos disponibles

| Comando | Descripción |
|---------|-------------|
| `bot hola` | Ver menú principal |
| `bot menu` | Ver menú interactivo |
| `bot gastos` | Resumen financiero |
| `bot facturas` | Últimas facturas |
| `bot presupuesto [cat] [monto]` | Establecer presupuesto |
| `bot alertas` | Ver alertas de presupuesto |
| `bot web` | Abrir dashboard web |
| `📸 Enviar foto` | Registrar factura automáticamente |

## 🔒 Privacidad

- El bot **SOLO** escucha mensajes en tu chat privado
- Si escribes en otro chat, el bot **NO** responde
- Las respuestas **SOLO** van a tu chat privado
- **Nadie más** ve la información financiera

## 🛠️ Solución de problemas

**Error de autenticación:** Borra la carpeta `.wwebjs_auth` y reinicia.
**No aparece el QR:** Espera unos segundos y recarga http://localhost:3000
**El bot no responde:** Verifica que estés en TU chat privado, no en otro chat.
