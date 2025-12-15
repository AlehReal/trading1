//-----------------------------------------------------
// CONFIG
//-----------------------------------------------------
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const axios = require('axios');  // CAMBIO: Usar axios en lugar de node-fetch
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');
const { htmlToText } = require('nodemailer-html-to-text');

//-----------------------------------------------------
// VALIDACIÓN .ENV
//-----------------------------------------------------
const requiredEnvVars = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET'
];

requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    console.error(`ERROR: Falta ${varName} en .env`);
    process.exit(1);
  }
});

if (!process.env.SKOOL_WEBHOOK_URL) {
  console.warn("WARN: SKOOL_WEBHOOK_URL no configurado. Las invitaciones a Skool se omitirán.");
}

//-----------------------------------------------------
// CONFIGURACIÓN DE CORREO
//-----------------------------------------------------
let emailTransporter;
if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  emailTransporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_PORT == 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
  emailTransporter.use('compile', htmlToText());
  console.log('✅ Servidor de correo configurado.');
} else {
  console.warn('⚠ ATENCIÓN: Configuración de email incompleta. No se enviarán correos.');
}

//-----------------------------------------------------
// EXPRESS
//-----------------------------------------------------
const app = express();
const PORT = process.env.PORT || 4242;

app.use(cors());
app.use(express.static(path.join(__dirname)));
app.use(express.json());

//-----------------------------------------------------
// 1. FUNCIÓN: Invitar a Skool - ADAPTADA PARA AXIOS
//-----------------------------------------------------
async function inviteToSkool(email) {
  const baseUrl = process.env.SKOOL_WEBHOOK_URL;

  if (!baseUrl) {
    console.warn("Skool: URL no configurada. Omitiendo invitación.");
    return { skipped: true, reason: 'No SKOOL_WEBHOOK_URL' };
  }

  // Construir URL con email como parámetro
  const inviteUrl = `${baseUrl}?email=${encodeURIComponent(email)}`;
  console.log(`📤 Invitando a Skool: ${email}`);
  console.log(`🔗 URL: ${inviteUrl}`);

  try {
    // CAMBIO: Usar axios en lugar de fetch
    const response = await axios.post(inviteUrl, null, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'BlueMakers/1.0'
      }
    });

    console.log(`📨 Respuesta Skool (${response.status}):`, response.data);
    return {
      ok: true,
      status: response.status,
      body: response.data,
      invited: true,
      urlUsed: inviteUrl
    };

  } catch (error) {
    // Axios maneja errores diferente
    if (error.response) {
      console.error(`❌ Error de Skool (${error.response.status}):`, error.response.data);
      return {
        ok: false,
        status: error.response.status,
        body: error.response.data,
        invited: false,
        error: error.message
      };
    } else {
      console.error("❌ Error de red o sistema:", error.message);
      return {
        error: error.message,
        invited: false
      };
    }
  }
}

//-----------------------------------------------------
// 2. FUNCIÓN: Enviar Email de Bienvenida
//-----------------------------------------------------
async function sendWelcomeEmail(email, name = '') {
  if (!emailTransporter) {
    console.warn('Servicio de email no disponible. Omitiendo.');
    return { skipped: true };
  }

  const skoolUrl = process.env.SKOOL_COMMUNITY_URL || 'https://app.skool.com/';
  const adminEmail = process.env.ADMIN_EMAIL;

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    bcc: adminEmail,
    subject: '🎉 ¡Bienvenido a Blue Makers Trading Academy!',
    html: `<!DOCTYPE html><html><body style="font-family: Arial;">
      <h2>¡Bienvenido${name ? ' ' + name : ''}!</h2>
      <p>Tu inscripción ha sido confirmada. Accede a nuestra comunidad aquí:</p>
      <p><a href="${skoolUrl}" style="background:#1677ff;color:white;padding:12px 20px;text-decoration:none;border-radius:5px;display:inline-block;">🚀 Ir a la Comunidad Skool</a></p>
      <p><strong>Enlace directo:</strong> <a href="${skoolUrl}">${skoolUrl}</a></p>
      <hr>
      <p><small>Blue Makers Trading Academy</small></p>
    </body></html>`
  };

  try {
    const info = await emailTransporter.sendMail(mailOptions);
    console.log(`✅ Email enviado a: ${email} (${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Error enviando email:`, error.message);
    return { error: error.message };
  }
}

//-----------------------------------------------------
// WEBHOOK de Stripe (El flujo principal)
//-----------------------------------------------------
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("❌ Error en webhook de Stripe:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Procesar pago exitoso
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_details?.email || session.customer_email;
    const name = session.customer_details?.name || '';

    console.log(`\n💰 Pago completado para: ${email}`);

    if (!email) {
      console.warn('⚠ Sesión sin email.');
      return res.json({ received: true });
    }

    try {
      // PASO 1: Invitar al usuario a Skool
      console.log('🔄 Paso 1/2: Invitando a Skool...');
      const skoolResult = await inviteToSkool(email);

      // PASO 2: Enviar email de bienvenida
      console.log('🔄 Paso 2/2: Enviando email de bienvenida...');
      const emailResult = await sendWelcomeEmail(email, name);

      console.log(`✅ Proceso finalizado para ${email}`);
      console.log(`   Skool: ${skoolResult.invited ? '✅' : '❌'} | Email: ${emailResult.success ? '✅' : '❌'}`);

    } catch (error) {
      console.error(`❌ Error procesando usuario ${email}:`, error);
    }
  }

  res.json({ received: true });
});

//-----------------------------------------------------
// Endpoint para crear sesión de pago
//-----------------------------------------------------
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Email válido requerido' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      line_items: [{ price: process.env.PRICE_ID, quantity: 1 }],
      success_url: process.env.SUCCESS_URL + `?email=${encodeURIComponent(email)}`,
      cancel_url: process.env.CANCEL_URL,
      metadata: { user_email: email }
    });

    res.json({ id: session.id });
  } catch (err) {
    console.error('Error creando sesión:', err);
    res.status(500).json({ error: err.message });
  }
});

//-----------------------------------------------------
// Endpoints adicionales útiles
//-----------------------------------------------------
app.get('/config', (req, res) => {
  res.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    skoolConfigured: !!process.env.SKOOL_WEBHOOK_URL,
    emailConfigured: !!emailTransporter
  });
});

app.post('/test-skool-invite', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Falta email' });
  const result = await inviteToSkool(email);
  res.json({ email, ...result });
});

app.post('/test-email', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Falta email' });
  const result = await sendWelcomeEmail(email, 'Usuario de Prueba');
  res.json(result);
});

//-----------------------------------------------------
// Iniciar servidor
//-----------------------------------------------------
// Exportar para Vercel Serverless
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor Blue Makers ejecutándose en: http://localhost:${PORT}`);
  console.log(`📧 Email configurado: ${emailTransporter ? '✅ Sí' : '❌ No'}`);
  console.log(`👥 Skool configurado: ${process.env.SKOOL_WEBHOOK_URL ? '✅ Sí' : '❌ No'}`);
});