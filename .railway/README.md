# Railway setup for Blue Makers Trading Academy

Este directorio contiene una guía y plantilla para desplegar este proyecto en Railway.

Qué incluye
- `../railway.template.json`: plantilla con las variables de entorno que necesitas configurar en Railway.

Pasos rápidos

1. En Railway crea un nuevo proyecto y conecta este repositorio.
2. Ve a Settings > Variables y copia las claves desde `railway.template.json`.
3. Si quieres persistencia para `data/pipelines.json`, habilita el plugin "Persistent Storage" en Railway y cambia `PIPELINE_STORE_PATH` a `/data/pipelines.json`.
4. Registra el webhook en Stripe: `https://<tu-app>.railway.app/webhook` y copia el signing secret a `STRIPE_WEBHOOK_SECRET`.

Auto-deploy (opcional)

Railway puede desplegar automáticamente con la integración de GitHub (Settings > Deployments). Alternativamente, puedo añadir un workflow de GitHub Actions que use la Railway CLI — dímelo y lo creo (necesitarás añadir `RAILWAY_API_TOKEN` como secret en GitHub).

Notas
- No incluyas secretos reales en el repo. Usa los secretos/variables del panel de Railway o GitHub Actions.
