#!/usr/bin/env node
'use strict';

/**
 * Local server for the Galley proofreader.
 *
 *   npm install
 *   ANTHROPIC_API_KEY=... npm start        # http://127.0.0.1:4317
 *
 * Serves public/ and answers two AI routes. The browser sends structured
 * inputs (text, dialect, style); the prompts are built here, so the server
 * cannot be used as an open relay to Claude and the API key never reaches
 * the browser. Without the SDK or credentials the rule engine still works:
 * the page simply hides the AI buttons.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const AI = require('./public/lib/ai');
const Engine = require('./public/lib/engine');

const PUBLIC_DIR = path.join(__dirname, 'public');
const MODEL = process.env.GALLEY_MODEL || 'claude-opus-5-5';
const MAX_BODY = 512 * 1024;
const MAX_CHUNK = AI.MAX_CHUNK * 2;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json'
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self'",
    "img-src 'self' data:",
    "frame-ancestors 'none'"
  ].join('; ')
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function loadSdk() {
  try {
    const mod = require('@anthropic-ai/sdk');
    return mod.default || mod;
  } catch (_err) {
    return null;
  }
}

function sanitizeOptions(raw) {
  const opts = raw && typeof raw === 'object' ? raw : {};
  return {
    dialect: typeof opts.dialect === 'string' ? opts.dialect.slice(0, 32) : 'en-US',
    style: typeof opts.style === 'string' ? opts.style.slice(0, 32) : 'cmos',
    mode: opts.mode === 'formal' ? 'formal' : 'creative',
    poetry: Boolean(opts.poetry)
  };
}

function sanitizeFindings(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 60).map(f => ({
    text: String((f && f.text) || '').slice(0, 120),
    message: String((f && f.message) || '').slice(0, 160)
  }));
}

/**
 * Call Claude with a JSON schema and return the parsed object.
 * Streams so long manuscripts never hit an HTTP timeout.
 */
async function askClaude(client, prompt, schema) {
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }]
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') {
    throw new HttpError(422, 'Claude declined to review this passage.');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new HttpError(413, 'Too many findings for one request. Check a shorter section.');
  }
  const text = message.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return AI.parseJson(text);
}

/**
 * Handle one AI request body. Exported for tests.
 * body: { kind: 'proofread', text, options, flow, findings }
 *     | { kind: 'summary', stats, options }
 */
async function handleAi(body, client) {
  if (!client) throw new HttpError(503, 'AI is not configured on this server.');
  const options = sanitizeOptions(body.options);
  const profile = Engine.resolveProfile(options);
  if (body.kind === 'proofread') {
    const text = typeof body.text === 'string' ? body.text : '';
    if (!text.trim()) throw new HttpError(400, 'Nothing to proofread.');
    if (text.length > MAX_CHUNK) throw new HttpError(413, `Send at most ${MAX_CHUNK} characters per request.`);
    const prompt = AI.buildProofreadPrompt({
      text, profile, flow: Boolean(body.flow), findings: sanitizeFindings(body.findings)
    });
    return askClaude(client, prompt, AI.ISSUES_SCHEMA);
  }
  if (body.kind === 'summary') {
    if (!body.stats || typeof body.stats !== 'object') throw new HttpError(400, 'Missing stats.');
    const prompt = AI.buildSummaryPrompt(body.stats, profile);
    return askClaude(client, prompt, AI.SUMMARY_SCHEMA);
  }
  throw new HttpError(400, 'Unknown request kind.');
}

function describeSdkError(err, Anthropic) {
  if (err instanceof HttpError) return err;
  if (Anthropic) {
    if (err instanceof Anthropic.AuthenticationError) return new HttpError(401, 'The server\'s Claude credentials were rejected. Set ANTHROPIC_API_KEY or run ant auth login.');
    if (err instanceof Anthropic.PermissionDeniedError) return new HttpError(403, 'The server\'s Claude key cannot use this model.');
    if (err instanceof Anthropic.RateLimitError) return new HttpError(429, 'Claude is rate limiting this key. Try again in a minute.');
    if (err instanceof Anthropic.BadRequestError) return new HttpError(400, `Claude rejected the request: ${err.message}`);
    if (err instanceof Anthropic.APIConnectionError) return new HttpError(502, 'Could not reach Claude. Check the network.');
    if (err instanceof Anthropic.APIError) return new HttpError(502, `Claude returned an error (${err.status}).`);
  }
  if (err instanceof SyntaxError || /JSON/.test(err.message)) return new HttpError(502, 'Claude\'s reply could not be read. Try again.');
  return new HttpError(500, 'Unexpected server error.');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Request too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (_err) {
        reject(new HttpError(400, 'Body must be JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, body, type) {
  res.writeHead(status, Object.assign({ 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, SECURITY_HEADERS));
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.resolve(PUBLIC_DIR, `.${rel}`);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'Not found' });
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, Object.assign({ 'Content-Type': type, 'Cache-Control': 'no-cache' }, SECURITY_HEADERS));
    res.end(data);
    return undefined;
  });
  return undefined;
}

function createServer(deps) {
  const Anthropic = deps && 'Anthropic' in deps ? deps.Anthropic : loadSdk();
  let client = deps && deps.client;
  if (client === undefined) {
    client = null;
    if (Anthropic) {
      try {
        client = new Anthropic();
      } catch (_err) {
        client = null; // no credentials: rules-only mode
      }
    }
  }
  return http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/api/status') {
        return send(res, 200, { ai: Boolean(client), model: client ? MODEL : null });
      }
      if (req.method === 'POST' && req.url === '/api/ai') {
        const body = await readBody(req);
        const result = await handleAi(body, client);
        return send(res, 200, result);
      }
      if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res);
      return send(res, 405, { error: 'Method not allowed' });
    } catch (err) {
      const httpErr = describeSdkError(err, Anthropic);
      if (httpErr.status >= 500) console.error('[galley]', err);
      return send(res, httpErr.status, { error: httpErr.message });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 4317;
  const host = process.env.HOST || '127.0.0.1';
  const server = createServer();
  server.listen(port, host, () => {
    console.log(`Galley proofreader on http://${host}:${port}`);
  });
}

module.exports = { createServer, handleAi, askClaude, HttpError, MODEL };
