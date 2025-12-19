//-----------------------------------------------------
// CONFIG
//-----------------------------------------------------
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const pipelineStore = require('./lib/pipeline-store');

//-----------------------------------------------------
// VALIDACIÓN .ENV (no salimos si faltan vars opcionales)
//-----------------------------------------------------
const requiredEnvVars = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];
requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    console.error(`ERROR: Falta ${varName} en .env`);
    process.exit(1);
  }
});

if (!process.env.SKOOL_WEBHOOK_URL) {
  console.warn('WARN: SKOOL_WEBHOOK_URL no configurado. Las invitaciones a Skool se omitirán.');
}

//-----------------------------------------------------
// EXPRESS
//-----------------------------------------------------
const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.static(path.join(__dirname)));
// Preserve raw body for Stripe signature verification
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

//-----------------------------------------------------
// Helpers: Skool invite, CRM, unlock
//-----------------------------------------------------
async function inviteToSkool(email) {
  const baseUrl = process.env.SKOOL_WEBHOOK_URL;
  if (!baseUrl) return { skipped: true, reason: 'No SKOOL_WEBHOOK_URL' };
  const inviteUrl = `${baseUrl}?email=${encodeURIComponent(email)}`;
  try {
    const response = await axios.post(inviteUrl, { email }, { headers: { 'Content-Type': 'application/json' } });
    return { ok: true, status: response.status, body: response.data, invited: true, urlUsed: inviteUrl };
  } catch (err) {
    if (err.response) return { ok: false, status: err.response.status, body: err.response.data, error: err.message };
    return { ok: false, error: err.message };
  }
}

async function sendPaidMemberToCRM(member) {
  const url = process.env.CRM_ENDPOINT;
  if (!url) return { skipped: true, reason: 'No CRM_ENDPOINT' };
  try {
    const res = await axios.post(url, { event: 'paid_member', member }, { headers: { 'Content-Type': 'application/json', Authorization: process.env.CRM_API_KEY ? `Bearer ${process.env.CRM_API_KEY}` : '' } });
    return { ok: true, status: res.status, body: res.data };
  } catch (err) {
    if (err.response) return { ok: false, status: err.response.status, body: err.response.data };
    return { ok: false, error: err.message };
  }
}

async function unlockCourseForMember(email, courseId) {
  const baseUrl = process.env.SKOOL_WEBHOOK_URL;
  if (!baseUrl) return { skipped: true, reason: 'No SKOOL_WEBHOOK_URL' };
  try {
    const response = await axios.post(baseUrl, { email, courseId, action: 'unlock_course' }, { headers: { 'Content-Type': 'application/json' } });
    return { ok: true, status: response.status, body: response.data };
  } catch (err) {
    if (err.response) return { ok: false, status: err.response.status, body: err.response.data };
    return { ok: false, error: err.message };
  }
}

//-----------------------------------------------------
// Pipeline processor
//-----------------------------------------------------
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function retryStep(stepFn, args = [], maxAttempts = 3, baseMs = 1000) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    try {
      attempt++;
      const result = await stepFn(...args);
      return { ok: true, attempt, result };
    } catch (err) {
      const waitMs = baseMs * Math.pow(2, attempt - 1);
      if (attempt >= maxAttempts) return { ok: false, attempt, error: err.message || err };
      await wait(waitMs);
    }
  }
  return { ok: false, attempt: 0, error: 'unknown' };
}

async function processPipeline(pipelineId, storePath) {
  const maxAttempts = parseInt(process.env.PIPELINE_RETRY_COUNT || '3', 10);
  const baseMs = parseInt(process.env.PIPELINE_RETRY_BASE_MS || '1000', 10);
  const p = await pipelineStore.getPipeline(pipelineId, storePath);
  if (!p) return;
  if (p.status === 'finished') {
    await pipelineStore.appendLog(pipelineId, 'Pipeline already finished, skipping', storePath);
    return;
  }
  await pipelineStore.updatePipeline(pipelineId, { status: 'in_progress' }, storePath);
  await pipelineStore.appendLog(pipelineId, 'Processing pipeline', storePath);

  // invite
  await pipelineStore.appendLog(pipelineId, 'Step: inviteToSkool', storePath);
  let current = await pipelineStore.getPipeline(pipelineId, storePath) || {};
  const existingInvite = current.steps && current.steps.invite;
  let inviteRes;
  if (existingInvite && existingInvite.ok) {
    await pipelineStore.appendLog(pipelineId, 'Skipping inviteToSkool (already succeeded)', storePath);
    inviteRes = existingInvite;
  } else {
    inviteRes = await retryStep(inviteToSkool, [p.data.email], maxAttempts, baseMs);
    await pipelineStore.appendLog(pipelineId, `inviteToSkool result: ${JSON.stringify(inviteRes)}`, storePath);
    current = await pipelineStore.getPipeline(pipelineId, storePath) || {};
    await pipelineStore.updatePipeline(pipelineId, { steps: Object.assign(current.steps || {}, { invite: inviteRes }) }, storePath);
    if (!inviteRes.ok) {
      await pipelineStore.updatePipeline(pipelineId, { status: 'failed' }, storePath);
      await pipelineStore.appendLog(pipelineId, 'Pipeline failed at invite step', storePath);
      return;
    }
  }

  // crm
  await pipelineStore.appendLog(pipelineId, 'Step: sendPaidMemberToCRM', storePath);
  current = await pipelineStore.getPipeline(pipelineId, storePath) || {};
  const existingCrm = current.steps && current.steps.crm;
  const member = { email: p.data.email, name: p.data.name, sessionId: p.data.sessionId };
  let crmRes;
  if (existingCrm && existingCrm.ok) {
    await pipelineStore.appendLog(pipelineId, 'Skipping sendPaidMemberToCRM (already succeeded)', storePath);
    crmRes = existingCrm;
  } else {
    crmRes = await retryStep(sendPaidMemberToCRM, [member], maxAttempts, baseMs);
    await pipelineStore.appendLog(pipelineId, `sendPaidMemberToCRM result: ${JSON.stringify(crmRes)}`, storePath);
    current = await pipelineStore.getPipeline(pipelineId, storePath) || {};
    await pipelineStore.updatePipeline(pipelineId, { steps: Object.assign(current.steps || {}, { crm: crmRes }) }, storePath);
  }

  // unlock
  const courseId = p.data.metadata && (p.data.metadata.course_id || p.data.metadata.courseId || p.data.metadata.course);
  if (courseId) {
    await pipelineStore.appendLog(pipelineId, `Step: unlockCourse (${courseId})`, storePath);
    current = await pipelineStore.getPipeline(pipelineId, storePath) || {};
    const existingUnlock = current.steps && current.steps.unlock;
    let unlockRes;
    if (existingUnlock && existingUnlock.ok) {
      await pipelineStore.appendLog(pipelineId, 'Skipping unlockCourse (already succeeded)', storePath);
      unlockRes = existingUnlock;
    } else {
      unlockRes = await retryStep(unlockCourseForMember, [p.data.email, courseId], maxAttempts, baseMs);
      await pipelineStore.appendLog(pipelineId, `unlockCourseForMember result: ${JSON.stringify(unlockRes)}`, storePath);
      current = await pipelineStore.getPipeline(pipelineId, storePath) || {};
      await pipelineStore.updatePipeline(pipelineId, { steps: Object.assign(current.steps || {}, { unlock: unlockRes }) }, storePath);
      if (!unlockRes.ok) {
        await pipelineStore.updatePipeline(pipelineId, { status: 'failed' }, storePath);
        await pipelineStore.appendLog(pipelineId, 'Pipeline failed at unlock step', storePath);
        return;
      }
    }
  }

  await pipelineStore.updatePipeline(pipelineId, { status: 'finished' }, storePath);
  await pipelineStore.appendLog(pipelineId, 'Pipeline finished successfully', storePath);
}

//-----------------------------------------------------
// WEBHOOK
//-----------------------------------------------------
app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  if (process.env.SKIP_STRIPE_SIGNATURE === '1') {
    event = req.body;
  } else {
    try {
      const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
      event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('❌ Error en webhook de Stripe:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.metadata?.user_email || session.customer_details?.email || session.customer_email;
    const name = session.customer_details?.name || '';
    console.log(`\n💰 Pago completado (session=${session.id}) para: ${email}`);
    if (!email) return res.json({ received: true });

    const pipelineId = session.id;
    const storePath = process.env.PIPELINE_STORE_PATH || pipelineStore.DEFAULT_STORE_PATH;
    await pipelineStore.createPipeline(pipelineId, { sessionId: session.id, email, name, amount_total: session.amount_total || null, currency: session.currency || null, metadata: session.metadata || {} }, storePath);
    await pipelineStore.appendLog(pipelineId, `Pipeline created for session ${session.id}`, storePath);
    (async () => {
      try { await processPipeline(pipelineId, storePath); } catch (err) { console.error('Async processing error:', err); await pipelineStore.appendLog(pipelineId, `Async processing error: ${err.message}`, storePath); }
    })();
  }

  res.json({ received: true });
});

//-----------------------------------------------------
// Helper: build urls for success/cancel
//-----------------------------------------------------
function buildUrls(req, email) {
  const envSuccess = process.env.SUCCESS_URL || '';
  const envCancel = process.env.CANCEL_URL || '';
  const isLocal = (u) => !u || u.includes('localhost') || u.startsWith('http://localhost');
  const addEmail = (u) => u ? (u + (u.includes('?') ? '&' : '?') + `email=${encodeURIComponent(email)}`) : null;
  if (!isLocal(envSuccess)) return { success_url: addEmail(envSuccess), cancel_url: envCancel || null };
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers['host'] || req.get('host');
  const base = `${proto}://${host}`.replace(/:\d+$/, '');
  return { success_url: `${base.replace(/\/$/, '')}/gracias.html?email=${encodeURIComponent(email)}`, cancel_url: `${base.replace(/\/$/, '')}/cancelado.html` };
}

//-----------------------------------------------------
// CREATE CHECKOUT SESSION
//-----------------------------------------------------
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Email válido requerido' });
    const urls = buildUrls(req, email);
    const session = await stripe.checkout.sessions.create({ mode: 'payment', customer_email: email, line_items: [{ price: process.env.PRICE_ID, quantity: 1 }], success_url: urls.success_url, cancel_url: urls.cancel_url || process.env.CANCEL_URL, metadata: { user_email: email } });
    res.json({ id: session.id });
  } catch (err) {
    console.error('Error creando sesión:', err);
    res.status(500).json({ error: err.message });
  }
});

//-----------------------------------------------------
// Monitoring endpoints
//-----------------------------------------------------
app.get('/config', (req, res) => {
  res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY, skoolConfigured: !!process.env.SKOOL_WEBHOOK_URL });
});

app.post('/test-skool-invite', async (req, res) => { const { email } = req.body; if (!email) return res.status(400).json({ error: 'Falta email' }); const result = await inviteToSkool(email); res.json({ email, ...result }); });

app.get('/pipelines', async (req, res) => { try { const storePath = process.env.PIPELINE_STORE_PATH || pipelineStore.DEFAULT_STORE_PATH; const list = await pipelineStore.listPipelines(storePath); res.json(list); } catch (err) { res.status(500).json({ error: err.message }); } });

app.get('/pipelines/:id', async (req, res) => { try { const id = req.params.id; const storePath = process.env.PIPELINE_STORE_PATH || pipelineStore.DEFAULT_STORE_PATH; const p = await pipelineStore.getPipeline(id, storePath); if (!p) return res.status(404).json({ error: 'Pipeline no encontrada' }); res.json(p); } catch (err) { res.status(500).json({ error: err.message }); } });

app.post('/pipelines/:id/retry', async (req, res) => {
  try {
    const id = req.params.id;
    const storePath = process.env.PIPELINE_STORE_PATH || pipelineStore.DEFAULT_STORE_PATH;
    const p = await pipelineStore.getPipeline(id, storePath);
    if (!p) return res.status(404).json({ error: 'Pipeline no encontrada' });
    if (p.status === 'finished') return res.status(400).json({ error: 'Pipeline ya finalizada' });
    await pipelineStore.appendLog(id, 'Manual retry requested', storePath);
    (async () => { try { await processPipeline(id, storePath); } catch (err) { await pipelineStore.appendLog(id, `Retry error: ${err.message}`, storePath); } })();
    res.json({ ok: true, message: 'Retry iniciado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => { res.json({ ok: true, uptime: process.uptime(), timestamp: new Date().toISOString() }); });

// Pre-initialize pipeline store
(async () => { try { const storePath = process.env.PIPELINE_STORE_PATH || pipelineStore.DEFAULT_STORE_PATH; if (pipelineStore && typeof pipelineStore.loadStore === 'function') { await pipelineStore.loadStore(storePath); console.log(`🗄️  Pipeline store ready at: ${storePath}`); } } catch (err) { console.warn('Could not initialize pipeline store:', err.message || err); } })();

// Start server
app.listen(PORT, () => { console.log(`\n🚀 Servidor Blue Makers ejecutándose en: http://localhost:${PORT}`); console.log(`👥 Skool configurado: ${process.env.SKOOL_WEBHOOK_URL ? '✅ Sí' : '❌ No'}`); });
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
// Email sending removed: webhook URL will handle emails upstream
const pipelineStore = require('./lib/pipeline-store');

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
// Email sending removed: the Skool webhook will handle emails.

//-----------------------------------------------------
// EXPRESS
//-----------------------------------------------------
const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.static(path.join(__dirname)));
// Preserve raw body for Stripe signature verification
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

//-----------------------------------------------------
// 1. FUNCIÓN: Invitar a Skool - ADAPTADA PARA AXIOS
//-----------------------------------------------------
async function inviteToSkool(email) {
  const baseUrl = process.env.SKOOL_WEBHOOK_URL;

  if (!baseUrl) {
    console.warn("Skool: URL no configurada. Omitiendo invitación.");
    return { skipped: true, reason: 'No SKOOL_WEBHOOK_URL' };
  }

    // Construir URL con email como parámetro (ej: ...?email=bob@gmail.com)
  const inviteUrl = `${baseUrl}?email=${encodeURIComponent(email)}`;
  console.log(`📤 Invitando a Skool: ${email}`);
  console.log(`🔗 POST ${inviteUrl} (body: { email })`);

  try {
    // Enviamos POST con body JSON { email } para mayor compatibilidad
    const response = await axios.post(inviteUrl, { email }, {
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

// -----------------------------------------------------
// FUNCIONES ADICIONALES: unlock y CRM (opcionales)
// -----------------------------------------------------
async function unlockCourseForMember(email, courseId) {
  const baseUrl = process.env.SKOOL_WEBHOOK_URL;
  if (!baseUrl) return { skipped: true, reason: 'No SKOOL_WEBHOOK_URL' };

  try {
    // Intentamos POST al webhook con action 'unlock_course'
    const response = await axios.post(baseUrl, { email, courseId, action: 'unlock_course' }, {
      headers: { 'Content-Type': 'application/json' }
    });
    return { ok: true, status: response.status, body: response.data };
  } catch (error) {
    if (error.response) {
      return { ok: false, status: error.response.status, body: error.response.data };
    }
    return { error: error.message };
  }
}

async function sendPaidMemberToCRM(member) {
  const url = process.env.CRM_ENDPOINT;
  if (!url) return { skipped: true, reason: 'No CRM_ENDPOINT' };
  try {
    const res = await axios.post(url, { event: 'paid_member', member }, {
      headers: { 'Content-Type': 'application/json', Authorization: process.env.CRM_API_KEY ? `Bearer ${process.env.CRM_API_KEY}` : '' }
    });
    return { ok: true, status: res.status, body: res.data };
  } catch (err) {
    if (err.response) return { ok: false, status: err.response.status, body: err.response.data };
    return { error: err.message };
  }
}

// Email sending removed — emails are sent by the Skool webhook.

// -----------------------------------------------------
// PIPELINE PROCESSOR
// -----------------------------------------------------
function wait(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function retryStep(stepFn, args = [], maxAttempts = 3, baseMs = 1000) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    try {
      attempt++;
      const result = await stepFn(...args);
      return { ok: true, attempt, result };
    } catch (err) {
      const waitMs = baseMs * Math.pow(2, attempt - 1);
      console.warn(`Step failed attempt ${attempt}/${maxAttempts}, retrying in ${waitMs}ms:`, err.message || err);
      if (attempt >= maxAttempts) return { ok: false, attempt, error: err.message || err };
      await wait(waitMs);
    }
  }
}

async function processPipeline(pipelineId, storePath) {
  const maxAttempts = parseInt(process.env.PIPELINE_RETRY_COUNT || '3', 10);
  const baseMs = parseInt(process.env.PIPELINE_RETRY_BASE_MS || '1000', 10);

  const p = await pipelineStore.getPipeline(pipelineId, storePath);
  if (!p) {
    console.error('Pipeline not found:', pipelineId);
    return;
  }
  // Idempotencia: si ya finished, no procesar
  if (p.status === 'finished') {
    await pipelineStore.appendLog(pipelineId, 'Pipeline already finished, skipping', storePath);
    return;
  }

  await pipelineStore.updatePipeline(pipelineId, { status: 'in_progress' }, storePath);
  await pipelineStore.appendLog(pipelineId, 'Processing pipeline', storePath);

  // Paso 1: Invitar a Skool
  await pipelineStore.appendLog(pipelineId, 'Step: inviteToSkool', storePath);
  // Recargar pipeline para comprobar si ya se ejecutó el paso (pre-invite)
  let current = (await pipelineStore.getPipeline(pipelineId, storePath)) || {};
  const existingInvite = current.steps && current.steps.invite;
  let inviteRes;
  if (existingInvite && existingInvite.ok) {
    pipelineStore.appendLog(pipelineId, 'Skipping inviteToSkool (already succeeded)', storePath);
    inviteRes = existingInvite;
  } else {
    inviteRes = await retryStep(inviteToSkool, [p.data.email], maxAttempts, baseMs);
    await pipelineStore.appendLog(pipelineId, `inviteToSkool result: ${JSON.stringify(inviteRes)}`, storePath);
    current = (await pipelineStore.getPipeline(pipelineId, storePath)) || {};
    await pipelineStore.updatePipeline(pipelineId, { steps: Object.assign(current.steps || {}, { invite: inviteRes }) }, storePath);
    if (!inviteRes.ok) {
      await pipelineStore.updatePipeline(pipelineId, { status: 'failed' }, storePath);
      await pipelineStore.appendLog(pipelineId, 'Pipeline failed at invite step', storePath);
      return;
    }
  }

  // Paso 2: Enviar a CRM (opcional)
  await pipelineStore.appendLog(pipelineId, 'Step: sendPaidMemberToCRM', storePath);
  // Comprobar si ya existe resultado CRM
  current = (await pipelineStore.getPipeline(pipelineId, storePath)) || {};
  const existingCrm = current.steps && current.steps.crm;
  const member = { email: p.data.email, name: p.data.name, sessionId: p.data.sessionId };
  let crmRes;
  if (existingCrm && existingCrm.ok) {
    pipelineStore.appendLog(pipelineId, 'Skipping sendPaidMemberToCRM (already succeeded)', storePath);
    crmRes = existingCrm;
  } else {
    crmRes = await retryStep(sendPaidMemberToCRM, [member], maxAttempts, baseMs);
    await pipelineStore.appendLog(pipelineId, `sendPaidMemberToCRM result: ${JSON.stringify(crmRes)}`, storePath);
    current = (await pipelineStore.getPipeline(pipelineId, storePath)) || {};
    await pipelineStore.updatePipeline(pipelineId, { steps: Object.assign(current.steps || {}, { crm: crmRes }) }, storePath);
  }

  // Paso 3: Unlock course si metadata.course_id
  const courseId = p.data.metadata && (p.data.metadata.course_id || p.data.metadata.courseId || p.data.metadata.course);
  if (courseId) {
    await pipelineStore.appendLog(pipelineId, `Step: unlockCourse (${courseId})`, storePath);
    current = (await pipelineStore.getPipeline(pipelineId, storePath)) || {};
    const existingUnlock = current.steps && current.steps.unlock;
    let unlockRes;
    if (existingUnlock && existingUnlock.ok) {
      pipelineStore.appendLog(pipelineId, 'Skipping unlockCourse (already succeeded)', storePath);
      unlockRes = existingUnlock;
    } else {
      unlockRes = await retryStep(unlockCourseForMember, [p.data.email, courseId], maxAttempts, baseMs);
      await pipelineStore.appendLog(pipelineId, `unlockCourseForMember result: ${JSON.stringify(unlockRes)}`, storePath);
      current = (await pipelineStore.getPipeline(pipelineId, storePath)) || {};
      await pipelineStore.updatePipeline(pipelineId, { steps: Object.assign(current.steps || {}, { unlock: unlockRes }) }, storePath);
      if (!unlockRes.ok) {
        await pipelineStore.updatePipeline(pipelineId, { status: 'failed' }, storePath);
        await pipelineStore.appendLog(pipelineId, 'Pipeline failed at unlock step', storePath);
        return;
      }
    }
  }
  // Finalizar pipeline (emails son enviadas por el webhook de Skool)
  await pipelineStore.updatePipeline(pipelineId, { status: 'finished' }, storePath);
  await pipelineStore.appendLog(pipelineId, 'Pipeline finished successfully', storePath);
}

//-----------------------------------------------------
// WEBHOOK de Stripe (El flujo principal)
//-----------------------------------------------------
app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  // Allow skipping signature verification for local testing when SKIP_STRIPE_SIGNATURE=1
  if (process.env.SKIP_STRIPE_SIGNATURE === '1') {
    try {
      event = req.body;
    } catch (err) {
      console.error('Error parsing webhook body in test mode:', err.message || err);
      return res.status(400).send('Webhook Error: bad body');
    }
  } else {
    try {
      const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
      event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error("❌ Error en webhook de Stripe:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }

    // Procesar pago exitoso: creamos pipeline y respondemos rápido
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    // Priorizar el email proporcionado en metadata (user_email) cuando exista.
    const email = session.metadata?.user_email || session.customer_details?.email || session.customer_email;
    const name = session.customer_details?.name || '';

    console.log(`\n💰 Pago completado (session=${session.id}) para: ${email}`);

    if (!email) {
      console.warn('⚠ Sesión sin email.');
      return res.json({ received: true });
    }

    // Crear pipeline persistente
    const pipelineId = session.id;
    const storePath = process.env.PIPELINE_STORE_PATH || pipelineStore.DEFAULT_STORE_PATH;
    await pipelineStore.createPipeline(pipelineId, {
      sessionId: session.id,
      email,
      name,
      amount_total: session.amount_total || null,
      currency: session.currency || null,
      metadata: session.metadata || {}
    }, storePath);

    await pipelineStore.appendLog(pipelineId, `Pipeline created for session ${session.id}`, storePath);

    // Process pipeline asynchronously (no bloqueamos la respuesta)
    (async () => {
      try {
        await processPipeline(pipelineId, storePath);
      } catch (err) {
        console.error('Error processing pipeline async:', err);
        await pipelineStore.appendLog(pipelineId, `Async processing error: ${err.message}`, storePath);
      }
    })();
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

    // Nota: no crear ni procesar pipeline aquí — la invitación a Skool
    // y demás pasos deben ejecutarse solo cuando recibamos el webhook
    // `checkout.session.completed` de Stripe. Esto evita envíos previos
    // antes de que el pago esté confirmado.
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
    skoolConfigured: !!process.env.SKOOL_WEBHOOK_URL
  });
});

app.post('/test-skool-invite', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Falta email' });
  const result = await inviteToSkool(email);
  res.json({ email, ...result });
});

// -----------------------------------------------------
// Endpoints para supervisión y reintento de pipelines
// -----------------------------------------------------
app.get('/pipelines', (req, res) => {
  (async () => {
    const storePath = process.env.PIPELINE_STORE_PATH || pipelineStore.DEFAULT_STORE_PATH;
    const list = await pipelineStore.listPipelines(storePath);
    res.json(list);
  })().catch(err => res.status(500).json({ error: err.message }));
});

app.get('/pipelines/:id', (req, res) => {
  (async () => {
    const id = req.params.id;
    const storePath = process.env.PIPELINE_STORE_PATH || pipelineStore.DEFAULT_STORE_PATH;
    const p = await pipelineStore.getPipeline(id, storePath);
    if (!p) return res.status(404).json({ error: 'Pipeline no encontrada' });
    res.json(p);
  })().catch(err => res.status(500).json({ error: err.message }));
});

app.post('/pipelines/:id/retry', async (req, res) => {
  const id = req.params.id;
  const storePath = process.env.PIPELINE_STORE_PATH || pipelineStore.DEFAULT_STORE_PATH;
  const p = await pipelineStore.getPipeline(id, storePath);
  if (!p) return res.status(404).json({ error: 'Pipeline no encontrada' });
  if (p.status === 'finished') return res.status(400).json({ error: 'Pipeline ya finalizada' });

  await pipelineStore.appendLog(id, 'Manual retry requested', storePath);
  // Lanzar procesamiento async
  (async () => {
    try {
      await processPipeline(id, storePath);
// Health check endpoint for PaaS
app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Pre-initialize pipeline store directory/file (useful for Railway ephemeral/Persistent Storage)
const storePath = process.env.PIPELINE_STORE_PATH || pipelineStore.DEFAULT_STORE_PATH;
try {
  if (pipelineStore && typeof pipelineStore.loadStore === 'function') {
    pipelineStore.loadStore(storePath);
    console.log(`🗄️  Pipeline store ready at: ${storePath}`);
  }
} catch (err) {
  console.warn('Could not initialize pipeline store:', err.message || err);
}
    } catch (err) {
      await pipelineStore.appendLog(id, `Retry error: ${err.message}`, storePath);
    }
  })();

  res.json({ ok: true, message: 'Retry iniciado' });
});

//-----------------------------------------------------
// Iniciar servidor
//-----------------------------------------------------
// Exportar para Vercel Serverless
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor Blue Makers ejecutándose en: http://localhost:${PORT}`);
  console.log(`👥 Skool configurado: ${process.env.SKOOL_WEBHOOK_URL ? '✅ Sí' : '❌ No'}`);
});

