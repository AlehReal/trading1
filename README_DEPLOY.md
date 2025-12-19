# README: Deploy & Secrets (Railway + GitHub + Stripe)

Este archivo explica, paso a paso, cómo añadir el secret `RAILWAY_API_TOKEN` en GitHub, cómo configurar el webhook en Stripe y los pasos de verificación tras desplegar en Railway.

1) Obtener `RAILWAY_API_TOKEN` (para GitHub Actions)

- Ve a tu cuenta de Railway: https://railway.app
- En tu perfil/Account Settings busca "API Keys" o "Tokens" y crea una nueva key personal (Personal API Key) si no tienes una.
- Copia el valor del token (ej. `rly_xxx...`).

2) Añadir `RAILWAY_API_TOKEN` a GitHub (Repository Secret)

- Entra a tu repositorio en GitHub `AlehReal/trading1`.
- Settings -> Secrets and variables -> Actions -> New repository secret.
- Nombre: `RAILWAY_API_TOKEN`
- Valor: pega el token que copiaste desde Railway.
- Guardar.

Nota: El workflow ` .github/workflows/deploy-to-railway.yml` comprobará la existencia de este secret y sólo intentará desplegar si está presente.

3) Configurar variables de entorno en Railway (Project > Settings > Variables)

Añade las variables requeridas listadas en `railway.template.json` o en `.env.example`:

- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`  ← signing secret de Stripe (ver más abajo)
- `PRICE_ID`
- `SUCCESS_URL` (ej. `https://<tu-app>.railway.app/gracias.html`)
- `CANCEL_URL`
- `SKOOL_WEBHOOK_URL` (URL de Skool que recibe invites/unlocks)
- Opcional: `CRM_ENDPOINT`, `CRM_API_KEY`
- Opcional: `PIPELINE_STORE_PATH` (por defecto `./data/pipelines.json`; pon `/data/pipelines.json` si activas Persistent Storage en Railway)

4) Registrar webhook en Stripe (obtener `STRIPE_WEBHOOK_SECRET`)

- Accede a Stripe Dashboard -> Developers -> Webhooks.
- Haz click en "Add endpoint".
- Endpoint URL: `https://<tu-app>.railway.app/webhook` (sustituye `<tu-app>` por el dominio que Railway te dé).
- Selecciona el evento: `checkout.session.completed` (también puedes seleccionar otros events si los necesitas).
- Crea el endpoint.
- En el endpoint creado, copia el "Signing secret" (whsec_...) y pégalo en Railway como variable `STRIPE_WEBHOOK_SECRET`.

5) Habilitar almacenamiento persistente para `data/pipelines.json` (recomendado)

- En Railway, añade el plugin "Persistent Storage" al proyecto (si lo ofrecen).
- Cambia `PIPELINE_STORE_PATH` en las Environment Variables a `/data/pipelines.json`.
- De esta forma el archivo `data/pipelines.json` permanecerá entre redeploys.

Alternativa: si no usas storage persistente, considera usar una base de datos (Postgres) para la persistencia; el código incluye soporte opcional mediante `DATABASE_URL`.

6) Verificar despliegue y pruebas

- Tras desplegar (o tras el Actions run), revisa el estado en Railway (Project → Deployments) y en GitHub Actions (Actions tab).
- Accede a `https://<tu-app>.railway.app/health` — debe devolver JSON con `ok: true`.
- Revisa `https://<tu-app>.railway.app/config` para comprobar que la `STRIPE_PUBLISHABLE_KEY` y `SKOOL_WEBHOOK_URL` aparecen como configuradas.

7) Probar webhooks localmente (opcional, con Stripe CLI)

- Instala Stripe CLI: https://stripe.com/docs/stripe-cli
- Inicia sesión: `stripe login`
- Reenvía webhooks a tu servidor local:

```bash
stripe listen --forward-to localhost:8080/webhook
```

- Para simular un `checkout.session.completed` puedes usar:

```bash
stripe trigger checkout.session.completed
```

Nota: cuando uses Stripe CLI los eventos estarán firmados con el signing secret local; para pruebas de firma en producción confía en el `STRIPE_WEBHOOK_SECRET` real que pegues en Railway.

8) Despliegue manual usando Railway CLI (alternativa al workflow)

- Instala Railway CLI o usa npx:

```bash
npx @railway/cli@latest login
npx @railway/cli@latest up --yes
```

9) Cómo comprobar los logs y runs en GitHub Actions

- Ve a la pestaña "Actions" en GitHub, selecciona el workflow "Deploy to Railway" y revisa el último run.
- Si el run falla por falta de `RAILWAY_API_TOKEN` verás el paso que lo reporta.

10) Seguridad y notas finales

- No subas secretos a GitHub en texto. Usa Secrets y Variables del proyecto en Railway.
- Verifica que `SKOOL_WEBHOOK_URL` acepte las llamadas tal como las hace el servidor (POST JSON { email } y/o `?email=` queryparam).
- En producción monitoriza pipelines fallidos y habilita backups de `data/pipelines.json` o utiliza Postgres.

Si quieres, puedo:
- Añadir instrucciones exactas para tu cuenta de Railway (con capturas de pantalla adaptadas).
- Probar el flujo de webhook localmente ahora usando Stripe CLI.
- Crear un script de integración para verificar una sesión de Checkout completa (generar sesión, escuchar webhook y validar pipeline).
