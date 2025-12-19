# Integración Stripe — Blue Makers Trading Academy

Resumen rápido en español y pasos para correr localmente.

Requisitos
- Node.js 18+ (o 16+)

Instalación

```bash
cd /home/alex/Documentos/trading
npm install
```

Configurar variables de entorno

1. Copia `.env.example` a `.env` y completa:
   - `STRIPE_SECRET_KEY` (sk_live... o sk_test...)
   - `STRIPE_PUBLISHABLE_KEY` (pk_live... o pk_test...)
   - `PRICE_ID` (el id del precio en Stripe, ej. `price_...`)
   - Opcional: `SUCCESS_URL` poner la URL de tu curso en Skool si quieres redirigir allí.

Ejecutar servidor

```bash
npm start
# o en desarrollo
npm run dev
```

Despliegue en Railway (resumen)

 - Crea un nuevo proyecto en Railway y conecta tu repo `AlehReal/trading1`.
 - En Settings > Variables de entorno añade las mismas variables de tu `.env`:
    - `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
    - `PRICE_ID`, `SUCCESS_URL`, `CANCEL_URL`
    - `SKOOL_WEBHOOK_URL`, `SKOOL_COMMUNITY_URL`
    - Asegúrate de configurar correctamente `SKOOL_WEBHOOK_URL`.

 - En Stripe Dashboard añade un webhook hacia `https://<tu-app>/webhook` y copia el signing secret en `STRIPE_WEBHOOK_SECRET` en Railway.

 - Asegúrate de que `SUCCESS_URL` y `CANCEL_URL` apunten a las páginas públicas en tu dominio (ej. `https://tu-app.railway.app/gracias.html`).

Notas de producción
 - El servidor mantiene un store local en `data/pipelines.json`. Para producción asegúrate de tener backups y monitorización.
 - Las invitaciones y correos los maneja la URL de Skool configurada en `SKOOL_WEBHOOK_URL`.

Despliegue en Railway (pasos detallados)

1) Crear proyecto
 - En Railway crea un nuevo proyecto y conecta el repositorio `AlehReal/trading1`.

2) Variables de entorno necesarias
 - `STRIPE_SECRET_KEY` (sk_live... o sk_test...)
 - `STRIPE_PUBLISHABLE_KEY`
 - `STRIPE_WEBHOOK_SECRET` (signing secret de Stripe para `/webhook`)
 - `PRICE_ID`
 - `SUCCESS_URL` (ej. `https://<tu-app>.railway.app/gracias.html`)
 - `CANCEL_URL`
 - `SKOOL_WEBHOOK_URL` (URL que Skool expone para recibir invites/unlocks)
 - Opcionales: `CRM_ENDPOINT`, `CRM_API_KEY`
 - Opcional: `PIPELINE_STORE_PATH` — por defecto es `./data/pipelines.json`. Para usar el volumen persistente de Railway puedes configurar `PIPELINE_STORE_PATH` a algo como `/data/pipelines.json` si agregas un plugin de almacenamiento persistente en Railway.

3) Configurar Storage persistente (recomendado)
 - Railway ofrece un plugin de "Persistent Storage". Si lo activas, asigna `PIPELINE_STORE_PATH=/data/pipelines.json` en las variables de entorno para que los pipelines se conserven entre redeploys.
 - Si no usas almacenamiento persistente, el archivo `data/pipelines.json` puede perderse cuando la instancia se reinicia. En ese caso considera usar una DB externa (Postgres) o un servicio de almacenamiento.

4) Registro del Webhook en Stripe
 - En Stripe Dashboard > Developers > Webhooks crea un endpoint apuntando a `https://<tu-app>.railway.app/webhook`.
 - Selecciona eventos `checkout.session.completed` y copia el signing secret en `STRIPE_WEBHOOK_SECRET` en Railway.

5) Build & Deploy
 - Railway detecta Node.js automáticamente. El comando usado es `npm start` (ver `Procfile`). También incluimos un `Dockerfile` si prefieres construir por contenedor.

6) Verificación post-deploy
 - Comprueba `https://<tu-app>.railway.app/health` — debe devolver JSON con `ok: true`.
 - Comprueba `/config` para ver la `STRIPE_PUBLISHABLE_KEY` y si `SKOOL_WEBHOOK_URL` está configurada.

Notas finales
 - El servidor crea pipelines únicamente cuando Stripe envía `checkout.session.completed`. Las invitaciones
    y el envío del correo son delegados a la `SKOOL_WEBHOOK_URL` que hayas configurado.
 - Si quieres migrar a Postgres más adelante, la base de código cuenta con un soporte opcional (añadir `DATABASE_URL`).


Luego abre `http://localhost:4242` y haz clic en "Start Trading Today".

Notas
- La creación de sesiones de Checkout se realiza en `server.js` para proteger la clave secreta.
- Si quieres que los compradores sean inscritos automáticamente en Skool, configura `SUCCESS_URL` con la URL de tu curso en Skool (o implementa la lógica necesaria en el backend/webhooks según exigencias de Skool).
