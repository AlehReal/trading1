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

Luego abre `http://localhost:4242` y haz clic en "Start Trading Today".

Notas
- La creación de sesiones de Checkout se realiza en `server.js` para proteger la clave secreta.
- Si quieres que los compradores sean inscritos automáticamente en Skool, configura `SUCCESS_URL` con la URL de tu curso en Skool (o implementa la lógica necesaria en el backend/webhooks según exigencias de Skool).
