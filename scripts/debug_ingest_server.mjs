#!/usr/bin/env node

import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const args = process.argv.slice(2);

const getArg = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  if (index === -1) {
    return fallback;
  }

  return args[index + 1] ?? fallback;
};

const host = getArg('host', '127.0.0.1');
const port = Number(getArg('port', '7242'));
const outputDir = path.resolve(
  getArg('output-dir', path.join(process.cwd(), '.debug-runtime-logs')),
);

if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`Invalid --port value: ${String(port)}`);
}

const json = (res, status, body) => {
  res.writeHead(status, {
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(body));
};

const appendEvents = async (sessionId, events) => {
  await fs.mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `${sessionId}.ndjson`);
  const payload =
    events
      .map((event) =>
        JSON.stringify({
          receivedAt: new Date().toISOString(),
          sessionId,
          event,
        }),
      )
      .join('\n') + '\n';
  await fs.appendFile(filePath, payload, 'utf8');
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
};

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url || !req.method) {
      json(res, 400, { error: 'Missing request metadata' });
      return;
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Origin': '*',
      });
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      json(res, 200, {
        host,
        outputDir,
        pid: process.pid,
        port,
        status: 'ok',
      });
      return;
    }

    if (req.method !== 'POST' || req.url !== '/ingest-client-logs') {
      json(res, 404, { error: 'Not found' });
      return;
    }

    const bodyText = await readBody(req);
    const body = JSON.parse(bodyText);
    const sessionId =
      typeof body?.sessionId === 'string' && body.sessionId.trim()
        ? body.sessionId.trim()
        : null;
    const events = Array.isArray(body?.events) ? body.events : null;

    if (!sessionId || !events) {
      json(res, 400, { error: 'Expected { sessionId, events[] }' });
      return;
    }

    await appendEvents(sessionId, events);
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
    });
    res.end();
  } catch (error) {
    json(res, 500, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

server.listen(port, host, () => {
  console.log(
    JSON.stringify({
      host,
      outputDir,
      pid: process.pid,
      port,
      status: 'listening',
      url: `http://${host}:${port}`,
    }),
  );
});

const shutdown = () => {
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
