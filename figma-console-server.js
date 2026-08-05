#!/usr/bin/env node
/**
 * CodeFig dev bridge server. Two jobs, one port (8765), dev builds only.
 *
 * 1. Console log (original purpose): POST / appends the body to figma-console.log,
 *    GET / or GET /log serves it. The log is readable by an agent during dev; the
 *    prepare script keeps it out of git.
 *
 * 2. Job queue: a terminal can ask the plugin to run something and get the result
 *    back, which is the only way to drive a real in-Figma run from outside Figma.
 *    Figma has no headless mode, so "automated" means "the plugin is open and polling".
 *
 *      POST /jobs            { script } or { code }  ->  { id }
 *      GET  /jobs/next       the plugin polls this   ->  a job, or 204 when idle
 *      POST /jobs/:id/result { ok, output }          ->  204
 *      GET  /jobs/:id        the CLI polls this      ->  the job with its result
 *
 * Queue state is in memory and dies with the process — it is a dev conduit, not
 * infrastructure. There is no auth, which is why nothing here may ever be reachable
 * from a production build: the UI's poller sits behind CODEFIG_BUILD_IS_DEV, and
 * `npm run build:production` leaves localhost out of the manifest entirely.
 *
 * Run with: npm run dev (included), or node figma-console-server.js standalone.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8765;
const LOG_FILE = path.join(__dirname, 'figma-console.log');

/** A job the plugin has not finished within this window is reported as timed out. */
const JOB_TIMEOUT_MS = 120000;

function createBridgeServer(options) {
  const opts = options || {};
  const logFile = opts.logFile || LOG_FILE;

  /** id -> job. Insertion-ordered, so the first queued job is the next one out. */
  const jobs = new Map();
  let nextId = 1;

  function json(res, status, body, headers) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
    res.end(JSON.stringify(body));
  }

  function nextQueuedJob() {
    for (const job of jobs.values()) {
      if (job.status === 'queued') return job;
    }
    return null;
  }

  /** Mark jobs the plugin picked up but never reported back on. */
  function expireStaleJobs(now) {
    for (const job of jobs.values()) {
      if (job.status !== 'done' && now - job.enqueuedAt > JOB_TIMEOUT_MS) {
        job.status = 'done';
        job.ok = false;
        job.output = '';
        job.error = 'Timed out after ' + JOB_TIMEOUT_MS + 'ms without a result from the plugin.';
        job.finishedAt = now;
      }
    }
  }

  const server = http.createServer((req, res) => {
    // CORS headers - must be in every response
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    const url = (req.url || '/').split('?')[0];
    expireStaleJobs(Date.now());

    // --- Job queue -----------------------------------------------------------

    // The plugin asks for work. 204 rather than an empty job so an idle poll is cheap.
    if (req.method === 'GET' && url === '/jobs/next') {
      const job = nextQueuedJob();
      if (!job) {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
      }
      job.status = 'running';
      job.startedAt = Date.now();
      json(res, 200, { id: job.id, script: job.script, code: job.code, args: job.args }, corsHeaders);
      return;
    }

    // The CLI asks how a job went.
    const statusMatch = req.method === 'GET' && url.match(/^\/jobs\/(\d+)$/);
    if (statusMatch) {
      const job = jobs.get(Number(statusMatch[1]));
      if (!job) {
        json(res, 404, { error: 'No such job' }, corsHeaders);
        return;
      }
      json(res, 200, job, corsHeaders);
      return;
    }

    const resultMatch = req.method === 'POST' && url.match(/^\/jobs\/(\d+)\/result$/);
    if (resultMatch) {
      readBody(req, (body) => {
        const job = jobs.get(Number(resultMatch[1]));
        if (!job) {
          json(res, 404, { error: 'No such job' }, corsHeaders);
          return;
        }
        let parsed = {};
        try {
          parsed = body ? JSON.parse(body) : {};
        } catch (err) {
          json(res, 400, { error: 'Result body is not JSON: ' + err.message }, corsHeaders);
          return;
        }
        job.status = 'done';
        job.ok = parsed.ok === true;
        job.output = typeof parsed.output === 'string' ? parsed.output : '';
        job.error = parsed.error != null ? String(parsed.error) : null;
        // Which build ran it, so the CLI can spot a plugin that needs reloading.
        job.buildId = parsed.buildId != null ? String(parsed.buildId) : null;
        job.finishedAt = Date.now();
        res.writeHead(204, corsHeaders);
        res.end();
      });
      return;
    }

    if (req.method === 'POST' && url === '/jobs') {
      readBody(req, (body) => {
        let parsed = {};
        try {
          parsed = body ? JSON.parse(body) : {};
        } catch (err) {
          json(res, 400, { error: 'Job body is not JSON: ' + err.message }, corsHeaders);
          return;
        }
        if (!parsed.script && !parsed.code) {
          json(res, 400, { error: 'A job needs a "script" name or raw "code".' }, corsHeaders);
          return;
        }
        const job = {
          id: nextId++,
          script: parsed.script != null ? String(parsed.script) : null,
          code: parsed.code != null ? String(parsed.code) : null,
          args: parsed.args != null ? parsed.args : null,
          status: 'queued',
          ok: null,
          output: '',
          error: null,
          buildId: null,
          enqueuedAt: Date.now(),
          startedAt: null,
          finishedAt: null
        };
        jobs.set(job.id, job);
        json(res, 201, { id: job.id }, corsHeaders);
      });
      return;
    }

    // --- Console log (unchanged) --------------------------------------------

    // GET / or /log: serve log file
    if (req.method === 'GET' && (url === '/' || url === '/log')) {
      try {
        const content = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          ...corsHeaders
        });
        res.end(content);
      } catch (err) {
        res.writeHead(500, {
          'Content-Type': 'text/plain',
          ...corsHeaders
        });
        res.end('Error reading log: ' + err.message);
      }
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405, {
        'Content-Type': 'text/plain',
        ...corsHeaders
      });
      res.end('Method Not Allowed\n');
      return;
    }

    readBody(req, (body) => {
      try {
        fs.appendFileSync(logFile, body, 'utf8');
      } catch (err) {
        console.error('Failed to append to', logFile, err.message);
      }
      res.writeHead(204, corsHeaders);
      res.end();
    });
  });

  return { server, jobs };
}

function readBody(req, done) {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => done(Buffer.concat(chunks).toString('utf8')));
}

if (require.main === module) {
  const { server } = createBridgeServer();
  server.listen(PORT, () => {
    console.log('CodeFig console bridge listening on http://localhost:' + PORT);
    console.log('Log file:', LOG_FILE);
    console.log('Job queue: POST /jobs to run a script in the open plugin (npm run test:figma)');
  });
}

module.exports = { createBridgeServer, PORT, JOB_TIMEOUT_MS };
