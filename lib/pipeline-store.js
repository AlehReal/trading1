/*
  file-backed pipeline store (async)
  This implementation is intentionally simple and single-responsibility.
*/
const fs = require('fs').promises;
const path = require('path');

const DEFAULT_STORE_PATH = path.join(__dirname, '..', 'data', 'pipelines.json');

async function ensureDataDir(storePath = DEFAULT_STORE_PATH) {
  const dir = path.dirname(storePath);
  try { await fs.mkdir(dir, { recursive: true }); } catch (e) { }
}

async function loadStore(storePath = DEFAULT_STORE_PATH) {
  await ensureDataDir(storePath);
  try {
    const exists = await fs.stat(storePath).then(() => true).catch(() => false);
    if (!exists) {
      await fs.writeFile(storePath, JSON.stringify({}), 'utf8');
      return {};
    }
    const raw = await fs.readFile(storePath, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.error('Error loading pipeline store:', err.message || err);
    return {};
  }
}

async function saveStore(store, storePath = DEFAULT_STORE_PATH) {
  try {
    await ensureDataDir(storePath);
    await fs.writeFile(storePath, JSON.stringify(store, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving pipeline store:', err.message || err);
    return false;
  }
}

async function getPipeline(id, storePath) {
  const store = await loadStore(storePath);
  return store[id] || null;
}

async function createPipeline(id, data = {}, storePath) {
  const store = await loadStore(storePath);
  if (store[id]) return store[id];
  const now = new Date().toISOString();
  const pipeline = {
    id,
    createdAt: now,
    updatedAt: now,
    status: 'pending',
    attempts: 0,
    data,
    logs: [],
    steps: {}
  };
  store[id] = pipeline;
  await saveStore(store, storePath);
  return pipeline;
}

async function updatePipeline(id, patch = {}, storePath) {
  const store = await loadStore(storePath);
  const pipeline = store[id];
  if (!pipeline) return null;
  Object.assign(pipeline, patch);
  pipeline.updatedAt = new Date().toISOString();
  store[id] = pipeline;
  await saveStore(store, storePath);
  return pipeline;
}

async function appendLog(id, entry, storePath) {
  const store = await loadStore(storePath);
  const pipeline = store[id];
  if (!pipeline) return null;
  pipeline.logs = pipeline.logs || [];
  pipeline.logs.push({ ts: new Date().toISOString(), entry });
  pipeline.updatedAt = new Date().toISOString();
  store[id] = pipeline;
  await saveStore(store, storePath);
  return pipeline;
}

async function listPipelines(storePath) {
  const store = await loadStore(storePath);
  return Object.values(store).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
}

module.exports = {
  DEFAULT_STORE_PATH,
  loadStore,
  saveStore,
  getPipeline,
  createPipeline,
  updatePipeline,
  appendLog,
  listPipelines
};
// Single clean pipeline-store implementation (file-backed)
const fs = require('fs').promises;
const path = require('path');

const DEFAULT_STORE_PATH = path.join(__dirname, '..', 'data', 'pipelines.json');

async function ensureDataDir(storePath = DEFAULT_STORE_PATH) {
  const dir = path.dirname(storePath);
  try { await fs.mkdir(dir, { recursive: true }); } catch (e) { }
}

async function loadStore(storePath = DEFAULT_STORE_PATH) {
  await ensureDataDir(storePath);
  try {
    const exists = await fs.stat(storePath).then(() => true).catch(() => false);
    if (!exists) {
      await fs.writeFile(storePath, JSON.stringify({}), 'utf8');
      return {};
    }
    const raw = await fs.readFile(storePath, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.error('Error loading pipeline store:', err.message || err);
    return {};
  }
}

async function saveStore(store, storePath = DEFAULT_STORE_PATH) {
  try {
    await ensureDataDir(storePath);
    await fs.writeFile(storePath, JSON.stringify(store, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving pipeline store:', err.message || err);
    return false;
  }
}

async function getPipeline(id, storePath) {
  const store = await loadStore(storePath);
  return store[id] || null;
}

async function createPipeline(id, data = {}, storePath) {
  const store = await loadStore(storePath);
  if (store[id]) return store[id];
  const now = new Date().toISOString();
  const pipeline = {
    id,
    createdAt: now,
    updatedAt: now,
    status: 'pending',
    attempts: 0,
    data,
    logs: [],
    steps: {}
  };
  store[id] = pipeline;
  await saveStore(store, storePath);
  return pipeline;
}

async function updatePipeline(id, patch = {}, storePath) {
  const store = await loadStore(storePath);
  const pipeline = store[id];
  if (!pipeline) return null;
  Object.assign(pipeline, patch);
  pipeline.updatedAt = new Date().toISOString();
  store[id] = pipeline;
  await saveStore(store, storePath);
  return pipeline;
}

async function appendLog(id, entry, storePath) {
  const store = await loadStore(storePath);
  const pipeline = store[id];
  if (!pipeline) return null;
  pipeline.logs = pipeline.logs || [];
  pipeline.logs.push({ ts: new Date().toISOString(), entry });
  pipeline.updatedAt = new Date().toISOString();
  store[id] = pipeline;
  await saveStore(store, storePath);
  return pipeline;
}

async function listPipelines(storePath) {
  const store = await loadStore(storePath);
  return Object.values(store).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
}

module.exports = {
  DEFAULT_STORE_PATH,
  loadStore,
  saveStore,
  getPipeline,
  createPipeline,
  updatePipeline,
  appendLog,
  listPipelines
};
const fs = require('fs').promises;
const path = require('path');

const DEFAULT_STORE_PATH = path.join(__dirname, '..', 'data', 'pipelines.json');

async function ensureDataDir(storePath = DEFAULT_STORE_PATH) {
  const dir = path.dirname(storePath);
  try { await fs.mkdir(dir, { recursive: true }); } catch (e) { }
}

async function loadStore(storePath = DEFAULT_STORE_PATH) {
  await ensureDataDir(storePath);
  try {
    const exists = await fs.stat(storePath).then(() => true).catch(() => false);
    if (!exists) {
      await fs.writeFile(storePath, JSON.stringify({}), 'utf8');
      return {};
    }
    const raw = await fs.readFile(storePath, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.error('Error loading pipeline store:', err.message || err);
    return {};
  }
}

async function saveStore(store, storePath = DEFAULT_STORE_PATH) {
  try {
    await ensureDataDir(storePath);
    await fs.writeFile(storePath, JSON.stringify(store, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving pipeline store:', err.message || err);
    return false;
  }
}

async function getPipeline(id, storePath) {
  const store = await loadStore(storePath);
  return store[id] || null;
}

async function createPipeline(id, data = {}, storePath) {
  const store = await loadStore(storePath);
  if (store[id]) return store[id];
  const now = new Date().toISOString();
  const pipeline = {
    id,
    createdAt: now,
    updatedAt: now,
    status: 'pending',
    attempts: 0,
    data,
    logs: [],
    steps: {}
  };
  store[id] = pipeline;
  await saveStore(store, storePath);
  return pipeline;
}

async function updatePipeline(id, patch = {}, storePath) {
  const store = await loadStore(storePath);
  const pipeline = store[id];
  if (!pipeline) return null;
  Object.assign(pipeline, patch);
  pipeline.updatedAt = new Date().toISOString();
  store[id] = pipeline;
  await saveStore(store, storePath);
  return pipeline;
}

async function appendLog(id, entry, storePath) {
  const store = await loadStore(storePath);
  const pipeline = store[id];
  if (!pipeline) return null;
  pipeline.logs = pipeline.logs || [];
  pipeline.logs.push({ ts: new Date().toISOString(), entry });
  pipeline.updatedAt = new Date().toISOString();
  store[id] = pipeline;
  await saveStore(store, storePath);
  return pipeline;
}

async function listPipelines(storePath) {
  const store = await loadStore(storePath);
  return Object.values(store).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
}

module.exports = {
  DEFAULT_STORE_PATH,
  loadStore,
  saveStore,
  getPipeline,
  createPipeline,
  updatePipeline,
  appendLog,
  listPipelines
};
const fs = require('fs').promises;
const path = require('path');

const DEFAULT_STORE_PATH = path.join(__dirname, '..', 'data', 'pipelines.json');

// Postgres optional support
let pgClient = null;
async function getPgClient() {
  if (pgClient) return pgClient;
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) return null;
  const { Client } = require('pg');
  pgClient = new Client({ connectionString: DATABASE_URL });
  await pgClient.connect();

  // Ensure table exists
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS pipelines (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMP WITH TIME ZONE,
      updated_at TIMESTAMP WITH TIME ZONE,
      status TEXT,
      attempts INTEGER,
      data JSONB,
      logs JSONB,
      steps JSONB
    );
  `);

  return pgClient;
}

async function ensureDataDir(storePath) {
  const dir = path.dirname(storePath || DEFAULT_STORE_PATH);
  try { await fs.mkdir(dir, { recursive: true }); } catch (e) { }
}

async function loadFileStore(storePath = DEFAULT_STORE_PATH) {
  await ensureDataDir(storePath);
  try {
    const exists = await fs.stat(storePath).then(() => true).catch(() => false);
    if (!exists) {
      await fs.writeFile(storePath, JSON.stringify({}), 'utf8');
      return {};
    }
    const raw = await fs.readFile(storePath, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.error('Error loading pipeline store:', err.message);
    return {};
  }
}

async function saveFileStore(store, storePath = DEFAULT_STORE_PATH) {
  try {
    await ensureDataDir(storePath);
    await fs.writeFile(storePath, JSON.stringify(store, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving pipeline store:', err.message);
    return false;
  }
}

// Public async API
async function getPipeline(id, storePath) {
  const client = await getPgClient();
  if (client) {
    const res = await client.query('SELECT * FROM pipelines WHERE id = $1', [id]);
    if (res.rowCount === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      status: row.status,
      attempts: row.attempts,
      data: row.data,
      logs: row.logs || [],
      steps: row.steps || {}
    };
  }

  const store = await loadFileStore(storePath);
  return store[id] || null;
}

async function createPipeline(id, data = {}, storePath) {
  const client = await getPgClient();
  const now = new Date().toISOString();
  if (client) {
    const exists = await client.query('SELECT 1 FROM pipelines WHERE id = $1', [id]);
    if (exists.rowCount > 0) {
      const row = await client.query('SELECT * FROM pipelines WHERE id = $1', [id]);
      return getPipeline(id);
    }
    await client.query(`INSERT INTO pipelines (id, created_at, updated_at, status, attempts, data, logs, steps) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)` , [id, now, now, 'pending', 0, data, [], {}]);
    return getPipeline(id);
  }

  const store = await loadFileStore(storePath);
  if (store[id]) return store[id];
  const pipeline = {
    id,
    createdAt: now,
    updatedAt: now,
    status: 'pending',
    attempts: 0,
    data,
    logs: [],
    steps: {}
  };
  store[id] = pipeline;
  await saveFileStore(store, storePath);
  return pipeline;
}

async function updatePipeline(id, patch = {}, storePath) {
  const client = await getPgClient();
  const now = new Date().toISOString();
  if (client) {
    // fetch existing
    const res = await client.query('SELECT * FROM pipelines WHERE id = $1', [id]);
    if (res.rowCount === 0) return null;
    const row = res.rows[0];
    const pipeline = {
      id: row.id,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      status: row.status,
      attempts: row.attempts,
      data: row.data || {},
      logs: row.logs || [],
      steps: row.steps || {}
    };
    Object.assign(pipeline, patch);
    pipeline.updatedAt = now;
    await client.query('UPDATE pipelines SET updated_at=$2, status=$3, attempts=$4, data=$5, logs=$6, steps=$7 WHERE id=$1', [id, pipeline.updatedAt, pipeline.status, pipeline.attempts || 0, pipeline.data || {}, pipeline.logs || [], pipeline.steps || {}]);
    return pipeline;
  }

  const store = await loadFileStore(storePath);
  const pipeline = store[id];
  if (!pipeline) return null;
  Object.assign(pipeline, patch);
  pipeline.updatedAt = now;
  store[id] = pipeline;
  await saveFileStore(store, storePath);
  return pipeline;
}

async function appendLog(id, entry, storePath) {
  const client = await getPgClient();
  const now = new Date().toISOString();
  if (client) {
    const res = await client.query('SELECT * FROM pipelines WHERE id = $1', [id]);
    if (res.rowCount === 0) return null;
    const row = res.rows[0];
    const logs = row.logs || [];
    logs.push({ ts: now, entry });
    await client.query('UPDATE pipelines SET logs=$2, updated_at=$3 WHERE id=$1', [id, logs, now]);
    const updated = await getPipeline(id);
    return updated;
  }
  const store = await loadFileStore(storePath);
  const pipeline = store[id];
  if (!pipeline) return null;
  pipeline.logs = pipeline.logs || [];
  pipeline.logs.push({ ts: now, entry });
  pipeline.updatedAt = now;
  store[id] = pipeline;
  await saveFileStore(store, storePath);
  return pipeline;
}

async function listPipelines(storePath) {
  const client = await getPgClient();
  if (client) {
    const res = await client.query('SELECT * FROM pipelines ORDER BY created_at DESC');
    return res.rows.map(r => ({
      id: r.id,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
      status: r.status,
      attempts: r.attempts,
      data: r.data,
      logs: r.logs || [],
      steps: r.steps || {}
    }));
  }
  const store = await loadFileStore(storePath);
  return Object.values(store).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
}

module.exports = {
  DEFAULT_STORE_PATH,
  getPipeline,
  createPipeline,
  updatePipeline,
  appendLog,
  listPipelines
};
const fs = require('fs');
const path = require('path');

const DEFAULT_STORE_PATH = path.join(__dirname, '..', 'data', 'pipelines.json');

function ensureDataDir(storePath) {
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadStore(storePath = DEFAULT_STORE_PATH) {
  ensureDataDir(storePath);
  try {
    if (!fs.existsSync(storePath)) {
      fs.writeFileSync(storePath, JSON.stringify({}), 'utf8');
      return {};
    }
    const raw = fs.readFileSync(storePath, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.error('Error loading pipeline store:', err.message);
    return {};
  }
}

function saveStore(store, storePath = DEFAULT_STORE_PATH) {
  try {
    ensureDataDir(storePath);
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving pipeline store:', err.message);
    return false;
  }
}

function getPipeline(id, storePath) {
  const store = loadStore(storePath);
  return store[id] || null;
}

function createPipeline(id, data = {}, storePath) {
  const store = loadStore(storePath);
  if (store[id]) {
    return store[id];
  }

  const pipeline = {
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'pending',
    attempts: 0,
    data,
    logs: [],
    steps: {}
  };

  store[id] = pipeline;
  saveStore(store, storePath);
  return pipeline;
}

function updatePipeline(id, patch = {}, storePath) {
  const store = loadStore(storePath);
  const pipeline = store[id];
  if (!pipeline) return null;
  Object.assign(pipeline, patch);
  pipeline.updatedAt = new Date().toISOString();
  store[id] = pipeline;
  saveStore(store, storePath);
  return pipeline;
}

function appendLog(id, entry, storePath) {
  const store = loadStore(storePath);
  const pipeline = store[id];
  if (!pipeline) return null;
  pipeline.logs = pipeline.logs || [];
  pipeline.logs.push({ ts: new Date().toISOString(), entry });
  pipeline.updatedAt = new Date().toISOString();
  store[id] = pipeline;
  saveStore(store, storePath);
  return pipeline;
}

function listPipelines(storePath) {
  const store = loadStore(storePath);
  return Object.values(store).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
}

module.exports = {
  DEFAULT_STORE_PATH,
  loadStore,
  saveStore,
  getPipeline,
  createPipeline,
  updatePipeline,
  appendLog,
  listPipelines
};
