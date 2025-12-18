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
