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
    - `EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`, `ADMIN_EMAIL`
    - Opcional: `DATABASE_URL` (provisiona un Postgres en Railway y pégalo aquí)
 - Si usas Postgres, puedes migrar pipelines locales con:

```bash
# desde la raíz del proyecto
DATABASE_URL="<tu_database_url>" node scripts/migrate-pipelines-to-postgres.js
```

 - En Stripe Dashboard añade un webhook hacia `https://<tu-app>/webhook` y copia el signing secret en `STRIPE_WEBHOOK_SECRET` en Railway.

 - Asegúrate de que `SUCCESS_URL` y `CANCEL_URL` apunten a las páginas públicas en tu dominio (ej. `https://tu-app.railway.app/gracias.html`).

Notas de producción
 - Es altamente recomendable usar `DATABASE_URL` (Postgres) en lugar del archivo JSON en producción para evitar pérdida de datos.
 - Usa un proveedor de email transaccional (SendGrid, Mailgun, Postmark) para mayor fiabilidad.

Luego abre `http://localhost:4242` y haz clic en "Start Trading Today".

Notas
- La creación de sesiones de Checkout se realiza en `server.js` para proteger la clave secreta.
- Si quieres que los compradores sean inscritos automáticamente en Skool, configura `SUCCESS_URL` con la URL de tu curso en Skool (o implementa la lógica necesaria en el backend/webhooks según exigencias de Skool).
