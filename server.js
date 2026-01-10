const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_FILE = path.join(__dirname, 'opinions.json');

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Simple in-memory list of SSE clients
const clients = [];

function sendEventToAll(opinion) {
  const data = `data: ${JSON.stringify(opinion)}\n\n`;
  clients.forEach(res => res.write(data));
}

function readOpinions() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    return [];
  }
}

function writeOpinions(list) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf8');
}

// MEDIA storage
const MEDIA_FILE = path.join(__dirname, 'media.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function readMedia() {
  try { const raw = fs.readFileSync(MEDIA_FILE, 'utf8'); return JSON.parse(raw || '[]'); } catch (e) { return []; }
}

function writeMedia(list) {
  fs.writeFileSync(MEDIA_FILE, JSON.stringify(list, null, 2), 'utf8');
}

const multer = require('multer');
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname) || '';
      cb(null, unique + ext);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// expose uploads directory (files accessible at /uploads/*)
app.use('/uploads', express.static(UPLOAD_DIR));

// Admin credentials - HARDCODED as requested by developer.
// WARNING: Hardcoding credentials is insecure. Remove or replace with environment
// variables before publishing or deploying to a shared environment.
const ADMIN_TOKEN = 'dev-token-please-change';
// Fixed admin user/password (set here per request). Replace values if needed.
const ADMIN_USER = 'admin_user';
const ADMIN_PASS = 'Admin_Pass12345678**+';

function isAdminRequest(req) {
  // check token first
  const token = req.headers['x-admin-token'] || req.query.admin_token;
  if (token && token === ADMIN_TOKEN) return true;

  // check username/password headers
  const user = req.headers['x-admin-user'];
  const pass = req.headers['x-admin-pass'];
  if (user && pass && user === ADMIN_USER && pass === ADMIN_PASS) return true;

  return false;
}

function requireAdmin(req, res, next) {
  if (isAdminRequest(req)) return next();
  return res.status(401).json({ error: 'Unauthorized - admin credentials required' });
}

// endpoint to validate admin credentials from frontend
app.get('/admin/validate', (req, res) => {
  if (isAdminRequest(req)) return res.json({ ok: true });
  return res.status(401).json({ ok: false });
});

// Endpoint to get all opinions
app.get('/opinions', (req, res) => {
  const list = readOpinions();
  res.json(list);
});

// Endpoint to add an opinion
app.post('/opinions', (req, res) => {
  const { name, message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'El mensaje es requerido' });
  }
  // accept optional rating
  let rating = null;
  if (typeof req.body.rating !== 'undefined') {
    const r = Number(req.body.rating);
    if (!Number.isNaN(r) && r >= 0 && r <= 5) {
      rating = Math.round(r);
    }
  }

  const list = readOpinions();
  const newOpinion = {
    id: Date.now(),
    name: name ? String(name).trim() : 'Anon',
    message: String(message).trim(),
    rating: rating,
    date: new Date().toISOString()
  };

  list.unshift(newOpinion);
  writeOpinions(list);

  // notify SSE clients
  sendEventToAll(newOpinion);

  res.status(201).json(newOpinion);
});

// Endpoint to rate/update an existing opinion
app.post('/opinions/:id/rate', (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  const rBody = req.body && req.body.rating;
  if (typeof rBody === 'undefined') return res.status(400).json({ error: 'rating is required' });
  const r = Number(rBody);
  if (Number.isNaN(r) || r < 0 || r > 5) return res.status(400).json({ error: 'rating must be 0-5' });

  const list = readOpinions();
  const idx = list.findIndex(o => Number(o.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'Opinion not found' });

  list[idx].rating = Math.round(r);
  writeOpinions(list);

  // notify SSE clients about the updated opinion
  sendEventToAll(list[idx]);

  res.json(list[idx]);
});

// Endpoint to update an existing opinion (edit)
app.put('/opinions/:id', (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  const { name, message, rating } = req.body || {};
  const list = readOpinions();
  const idx = list.findIndex(o => Number(o.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'Opinion not found' });

  if (typeof name !== 'undefined') list[idx].name = String(name).trim() || list[idx].name;
  if (typeof message !== 'undefined') {
    if (!message || !String(message).trim()) return res.status(400).json({ error: 'El mensaje es requerido' });
    list[idx].message = String(message).trim();
  }
  if (typeof rating !== 'undefined') {
    const r = Number(rating);
    list[idx].rating = (!Number.isNaN(r) && r >= 0 && r <= 5) ? Math.round(r) : null;
  }
  // update timestamp
  list[idx].date = new Date().toISOString();

  writeOpinions(list);
  // notify SSE clients about update
  sendEventToAll(list[idx]);
  res.json(list[idx]);
});

// Endpoint to delete an opinion
app.delete('/opinions/:id', (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  const list = readOpinions();
  const idx = list.findIndex(o => Number(o.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'Opinion not found' });

  list.splice(idx, 1);
  writeOpinions(list);
  res.json({ ok: true, id });
});

// List media items
app.get('/media', (req, res) => {
  const list = readMedia();
  res.json(list);
});

// Upload a media file (image or short video) - restricted to admin
app.post('/media', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { originalname, filename, mimetype, size } = req.file;
  const item = {
    id: Date.now(),
    originalname,
    filename,
    url: `/uploads/${filename}`,
    mimetype,
    size,
    date: new Date().toISOString()
  };
  const list = readMedia();
  list.unshift(item);
  writeMedia(list);
  res.status(201).json(item);
});

// Delete a media item and remove file - restricted to admin
app.delete('/media/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  const list = readMedia();
  const idx = list.findIndex(m => Number(m.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'Media not found' });

  const item = list[idx];
  // remove file
  try {
    const filePath = path.join(UPLOAD_DIR, item.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.error('Error deleting file', e);
    // continue to remove metadata
  }

  list.splice(idx, 1);
  writeMedia(list);
  res.json({ ok: true, id });
});

// SSE endpoint for real-time updates
app.get('/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.flushHeaders();

  // send a ping to keep connection alive
  const id = Date.now();
  res.write(`: connected ${id}\n\n`);

  clients.push(res);

  req.on('close', () => {
    const idx = clients.indexOf(res);
    if (idx !== -1) clients.splice(idx, 1);
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
