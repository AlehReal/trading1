#!/usr/bin/env node
// Simple migration: read JSON store and insert into Postgres.
const fs = require('fs').promises;
const path = require('path');
(async function(){
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return console.error('Set DATABASE_URL env var');
  const { Client } = require('pg');
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  const file = path.join(__dirname, '..', 'data', 'pipelines.json');
  try {
    const raw = await fs.readFile(file, 'utf8');
    const store = raw ? JSON.parse(raw) : {};
    for (const id of Object.keys(store)){
      const p = store[id];
      const res = await client.query('SELECT 1 FROM pipelines WHERE id=$1', [id]);
      if (res.rowCount>0) { console.log('Skipping existing', id); continue; }
      await client.query('INSERT INTO pipelines (id, created_at, updated_at, status, attempts, data, logs, steps) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [
        id,
        p.createdAt ? new Date(p.createdAt) : new Date(),
        p.updatedAt ? new Date(p.updatedAt) : new Date(),
        p.status || 'pending',
        p.attempts || 0,
        p.data || {},
        p.logs || [],
        p.steps || {}
      ]);
      console.log('Inserted', id);
    }
    console.log('Migration complete');
  } catch (err) {
    console.error('Migration error:', err.message);
  } finally {
    await client.end();
  }
})();
