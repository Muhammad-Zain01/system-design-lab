const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

function loadLocalEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !Object.hasOwn(process.env, match[1])) {
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}

loadLocalEnv();

const primary = new Pool({
  connectionString: process.env.PRIMARY_DATABASE_URL ||
    'postgresql://replicator:local-dev-only@127.0.0.1:15432/ecommerce',
});
const replica = new Pool({
  connectionString: process.env.REPLICA_DATABASE_URL ||
    'postgresql://replicator:local-dev-only@127.0.0.1:15433/ecommerce',
});
const indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));

function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('Request body is too large.');
  }
  return JSON.parse(body || '{}');
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(indexHtml);
      return;
    }

    // Reads intentionally go to DB2, the physical read replica.
    if (req.method === 'GET' && url.pathname === '/api/todos') {
      const result = await replica.query(
        'SELECT id, title, created_at FROM todos ORDER BY id DESC',
      );
      sendJson(res, 200, { source: 'read-replica', todos: result.rows });
      return;
    }

    // Writes intentionally go to DB1, the primary.
    if (req.method === 'POST' && url.pathname === '/api/todos') {
      const body = await readJson(req);
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title || title.length > 200) {
        sendJson(res, 400, { error: 'Enter a TODO title from 1 to 200 characters.' });
        return;
      }

      const result = await primary.query(
        'INSERT INTO todos (title) VALUES ($1) RETURNING id, title, created_at',
        [title],
      );
      sendJson(res, 201, { source: 'primary', todo: result.rows[0] });
      return;
    }

    const todoRoute = url.pathname.match(/^\/api\/todos\/(\d+)$/);
    if (todoRoute && req.method === 'PATCH') {
      const body = await readJson(req);
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title || title.length > 200) {
        sendJson(res, 400, { error: 'Enter a TODO title from 1 to 200 characters.' });
        return;
      }

      const result = await primary.query(
        'UPDATE todos SET title = $1 WHERE id = $2 RETURNING id, title, created_at',
        [title, todoRoute[1]],
      );
      if (result.rowCount === 0) {
        sendJson(res, 404, { error: 'TODO not found.' });
        return;
      }
      sendJson(res, 200, { source: 'primary', todo: result.rows[0] });
      return;
    }

    if (todoRoute && req.method === 'DELETE') {
      const result = await primary.query(
        'DELETE FROM todos WHERE id = $1 RETURNING id',
        [todoRoute[1]],
      );
      if (result.rowCount === 0) {
        sendJson(res, 404, { error: 'TODO not found.' });
        return;
      }
      sendJson(res, 200, { source: 'primary', id: result.rows[0].id });
      return;
    }

    sendJson(res, 404, { error: 'Not found.' });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: 'Request failed. Check that both PostgreSQL containers are running and replication is healthy.' });
  }
});

async function start() {
  // Create the table only on DB1. Physical replication carries this DDL to DB2.
  await primary.query(`
    CREATE TABLE IF NOT EXISTS todos (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const port = Number(process.env.PORT || 3000);
  server.listen(port, '127.0.0.1', () => {
    console.log(`TODO app: http://127.0.0.1:${port}`);
    console.log('Writes -> DB1 primary (localhost:15432); reads -> DB2 replica (localhost:15433).');
  });
}

start().catch((error) => {
  console.error('Could not initialize the TODO app on the primary database:', error.message);
  process.exitCode = 1;
});

async function close() {
  server.close();
  await Promise.all([primary.end(), replica.end()]);
}

process.on('SIGINT', close);
process.on('SIGTERM', close);
