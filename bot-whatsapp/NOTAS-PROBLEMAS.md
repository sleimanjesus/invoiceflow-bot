# NOTAS — Problemas pendientes del Bot de WhatsApp

## 📅 Fecha: 28/04/2026

---

## 🚨 PROBLEMA PRINCIPAL: El bot no puede borrar mensajes de otros chats

### Síntoma:
Cuando el dueño escribe "mis facturas" en el chat de otra persona, el mensaje se envía a su propio número (584128048173). El bot lo captura con `message_create`, pero `msg.from` es `584128048173@c.us` (el chat privado del dueño), NO el chat de la otra persona.

### Causa:
- `message_create` captura los mensajes que el propio usuario envía
- Cuando el dueño está en el chat de "Persona X" y escribe "mis facturas", el mensaje se envía al número del dueño (porque el bot está vinculado a ese número)
- WhatsApp interpreta que el mensaje es para el chat privado del dueño
- El bot no puede saber en qué chat estaba el dueño cuando escribió

### Posibles soluciones a investigar:

1. **Usar `message.ack` para detectar el chat original**
   - El evento `message_ack` podría dar información sobre desde dónde se envió

2. **Usar `msg.id.remote` o `msg.id.fromMe`**
   - Investigar si hay metadatos adicionales en el objeto Message

3. **Enfoque alternativo: No usar `message_create`**
   - Usar solo `message` (mensajes recibidos) en lugar de `message_create`
   - El dueño escribe en el chat de la otra persona, y el bot responde en privado
   - PERO: el mensaje "mis facturas" se lo escribiría a la otra persona, no al bot

4. **Solución más radical: Usar WebSocket en lugar de `message_create`**
   - Conectar directamente al WebSocket de WhatsApp Web
   - Tener control total sobre los mensajes

5. **Solución simple: El dueño siempre escribe al bot desde su chat privado**
   - Cambiar la lógica: el bot solo escucha mensajes en el chat privado del dueño
   - El dueño siempre debe escribir al bot desde su propio chat
   - Esto es más simple y confiable

---

## ✅ COSAS QUE FUNCIONAN:

- [x] Bot se conecta y autentica correctamente
- [x] Servidor web en http://localhost:3000 funciona
- [x] Reconexión automática al desconectarse
- [x] Anti-loop (no responde sus propias respuestas)
- [x] Solo responde al dueño (ignora a otros)
- [x] API de Render responde correctamente
- [x] Comandos: hola, mis facturas, mis gastos, alertas, presupuesto, web
- [x] Procesamiento de fotos de facturas

---

## 📋 CÓMO INICIAR EL BOT:

```bash
cd C:\Users\pc\Desktop\invoiceflow\bot-whatsapp
node bot-final.js
```

Luego abrir: http://localhost:3000

---

## 🔧 ARCHIVOS IMPORTANTES:

- `C:\Users\pc\Desktop\invoiceflow\bot-whatsapp\bot-final.js` — El bot principal (v2.1)
- `C:\Users\pc\Desktop\invoiceflow\bot-whatsapp\README-BOT.md` — Instrucciones
- `C:\Users\pc\Desktop\invoiceflow\bot-whatsapp\package.json` — Dependencias

---

## ✅ ESTADO ACTUAL (28/04 - antes de dormir):

El bot YA FUNCIONA de la siguiente manera:
- Cuando el dueño escribe "mis facturas" en el chat de OTRA persona, el mensaje se envía al número del dueño
- El bot lo captura y responde en el chat privado del dueño
- La otra persona NO ve nada porque el mensaje va al número del dueño, no al de ella
- **Esto ya es un comportamiento aceptable** ✅

## 💡 CÓMO FUNCIONAN LOS BOTS DE WHATSAPP QUE VES POR AHÍ

Investigando cómo funcionan los bots de WhatsApp populares (como los de atención al cliente, bots de grupos, etc.):

### Opción 1: Mismo número del dueño (la más común y simple) ✅
**Así funcionan la mayoría de los bots personales:**
- El bot se conecta con el **mismo número del dueño**
- El dueño **SIEMPRE le escribe al bot desde su chat privado**
- El bot responde en el mismo chat privado
- **NO necesitas otro número, NO necesitas chip**

**¿Cómo se hace?** 
- El bot solo escucha mensajes en el chat `OWNER_NUMBER@c.us`
- El dueño abre WhatsApp, va a su propio chat, y escribe los comandos
- El bot responde ahí mismo

**Esto es lo que YA tenemos casi funcionando** — solo falta ajustar para que el bot solo escuche en el chat privado.

### Opción 2: Número virtual SIN chip (Twilio, etc.)
- Twilio te da un número virtual por ~$1/mes
- No necesitas SIM física
- Pero WhatsApp puede bloquearlo porque son números VoIP

### Opción 3: WhatsApp Business API (la oficial)
- La opción profesional
- Requiere configuración con Meta
- No recomendada para uso personal

---

## 🆕 MEJORA SOLICITADA (para mañana): Bot con nombre y menú interactivo

### 🔑 Cambio principal: Usar prefijo "bot" para todos los comandos

En lugar de que el bot responda a palabras sueltas como "mis facturas" (que podrían escribirse en otros contextos), ahora usaremos:

**`bot [comando]`** — Ejemplos:
- `bot hola` → El bot saluda y muestra el menú
- `bot menu` → Muestra el menú interactivo
- `bot facturas` → Muestra las facturas
- `bot gastos` → Muestra resumen de gastos
- `bot web` → Enlace al dashboard

**Ventaja:** Así nunca se activa por accidente. Solo cuando escribes "bot" + comando.

### 🆕 Menú interactivo con números

Cuando escribas `bot hola` o `bot menu`, el bot responderá:

```
🤖 *InvoiceFlow Bot*
¡Hola, [Nombre del dueño]! 👋

¿Qué deseas hacer?

1️⃣ 📊 Ver mis gastos
2️⃣ 📋 Ver mis facturas
3️⃣ 💰 Establecer presupuesto
4️⃣ ⚠️ Ver alertas
5️⃣ 🌐 Abrir dashboard web
6️⃣ 📸 Registrar factura (envía foto)

Responde con el número (ej: "1") 
o escribe "bot [comando]"
```

Luego si respondes "1", te muestra los gastos. Si respondes "2", las facturas, etc.

### 🆕 Nombre y personalización

- El bot se presentará como **"InvoiceFlow Bot"** 
- Mostrará tu nombre (o el de la empresa) en los saludos
- Se puede agregar un logo/emoji personalizado
- Respuestas con formato profesional

### 📋 CÓDIGO A IMPLEMENTAR (mañana):

```javascript
// En lugar de detectar palabras sueltas:
if (texto === 'mis facturas') { ... }

// Detectaremos solo con prefijo:
if (texto.startsWith('bot ')) {
    const comando = texto.replace('bot ', '').trim();
    
    if (comando === 'hola' || comando === 'menu' || comando === 'ayuda') {
        // Mostrar menú interactivo
    }
    else if (comando === 'facturas' || comando === '1') {
        // Mostrar facturas
    }
    else if (comando === 'gastos' || comando === '2') {
        // Mostrar gastos
    }
    // ... etc
}
```

### ✅ Beneficios de este enfoque:

1. **No hay activación accidental** — Solo con "bot" + comando
2. **Puedes hablar de facturas/gastos en otros chats** sin que el bot reaccione
3. **Menú interactivo** — Fácil de usar, solo respondes números
4. **Profesional** — El bot tiene identidad propia
5. **El bot solo escucha en tu chat privado** — Nadie más lo ve

### 📝 PENDIENTE PARA MAÑANA — 29/04/2026

#### 🔴 PRIORIDAD 1: PULIR EL BOT
- [ ] **Arreglar imágenes/fotos de facturas** — Que cuando el usuario envíe una foto, el bot la procese correctamente con DeepSeek Vision (no datos simulados)
- [ ] **Procesar imágenes desde WhatsApp** — Asegurar que el bot descargue bien las fotos y las envíe al backend
- [ ] **Mejorar detección de imágenes** — Que reconozca fotos aunque no tengan el prefijo "bot"
- [ ] **Probar flujo completo:** foto → procesar → guardar → responder

#### 🔴 PRIORIDAD 2: MEJORAR LA WEB (DASHBOARD)
- [ ] **Revisar y corregir errores del dashboard** (templates/dashboard.html, static/script.js, static/style.css)
- [ ] **Verificar que Chart.js cargue correctamente**
- [ ] **Corregir errores de la consola del navegador**
- [ ] **Mejorar diseño responsive** (que se vea bien en móvil)
- [ ] **Agregar estado de carga/loading** mientras se obtienen datos
- [ ] **Manejar errores de API** (cuando el backend no responde)
- [ ] **Agregar botón para borrar datos** desde la web
- [ ] **Hacer deploy del main.py actualizado** a Render (con endpoint de borrado)

#### 🔴 PRIORIDAD 3: GOOGLE SHEETS INTEGRATION
- [ ] **Crear endpoint en backend** para exportar datos a Google Sheets
- [ ] **Usar Google Sheets API** (gspread o similar)
- [ ] **Agregar comando en el bot:** `bot sheets` o `bot exportar`
- [ ] **Agregar botón en el dashboard** "Exportar a Google Sheets"
- [ ] **Sincronización automática** — Cada factura nueva se agrega a Sheets
- [ ] **Configurar autenticación** con service account de Google
- [ ] **Estructura de la hoja:** Fecha, Proveedor, Categoría, Monto, Notas

#### 📋 DETALLES TÉCNICOS:

**Para Google Sheets:**
```python
# requirements.txt
gspread
google-auth
google-auth-oauthlib
google-auth-httplib2
```

**Para imágenes (DeepSeek Vision):**
```python
# En lugar de extraer_factura_simulada(), usar DeepSeek API
# para leer el texto de la imagen de la factura
```

**Para el dashboard:**
- Revisar que Chart.js funcione con datos vacíos
- Agregar manejo de errores en fetch()
- Mejorar la experiencia cuando no hay datos
- Agregar animaciones de carga

