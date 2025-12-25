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
