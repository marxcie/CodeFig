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
 * 3. UI commands: the same trick for the iframe rather than the sandbox. Every bug in the
 *    config panel this month lived somewhere only a human clicking could reach, which made
 *    the human the instrument. These let a terminal press the buttons.
 *
 *      POST /ui              { command, args }       ->  { id }
 *      GET  /ui/next         the plugin polls this   ->  a command, or 204 when idle
 *      POST /ui/:id/result   { ok, result }          ->  204
 *      GET  /ui/:id          the CLI polls this      ->  the command with its result
 *
 *    Commands are **named, not evaluated**. `{ command: "readConfig" }`, never a string of
 *    JavaScript to run in the iframe: every UI action worth driving is nameable, so an eval
 *    channel would be a strictly larger hole for no extra reach.
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

/**
 * True if the manifest at `manifestPath` allows localhost — a dev build. Throws if the file is
 * missing or not JSON, so a caller can tell "no dist/" apart from "dist/, but production."
 */
function manifestAllowsLocalhost(manifestPath) {
  var manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  var domains = (manifest.networkAccess && manifest.networkAccess.allowedDomains) || [];
  return domains.some(function (d) { return /localhost/i.test(d); });
}

/**
 * Refuses to queue a job against a production `dist/`. A production manifest has no localhost in
 * `allowedDomains` — the same fact `build-scripts.js`'s `writeManifest()` writes and
 * `CODEFIG_BUILD_IS_DEV` gates in `src/ui.html` — so a plugin loaded from one can run a job and log
 * its own START, but `_codefigBridgeFetch` is a no-op there and the result never reaches this
 * queue. Without this check that reads as a 120s timeout with no other signal; a real hang looks
 * identical from the CLI's side, which is exactly the trap this closes. One source of truth: the
 * literal `dist/manifest.json` on disk, not a second guess at which build is running.
 */
function assertDevBuild(manifestPath) {
  var target = manifestPath || path.join(__dirname, 'dist', 'manifest.json');
  var isDev;
  try {
    isDev = manifestAllowsLocalhost(target);
  } catch (err) {
    console.error('❌ No dist/manifest.json. Run npm run build:dev first.');
    process.exit(1);
    return;
  }
  if (!isDev) {
    console.error('❌ dist/ is a production build. It has no localhost, so a queued job can never report back. Run npm run build:dev first.');
    process.exit(1);
  }
}

function createBridgeServer(options) {
  const opts = options || {};
  const logFile = opts.logFile || LOG_FILE;

  function json(res, status, body, headers) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
    res.end(JSON.stringify(body));
  }

  /**
   * One queue implementation, used by both `/jobs` and `/ui`.
   *
   * Written once rather than twice on purpose. Two queues with the same lifecycle, maintained
   * separately, is the shape that has produced five bugs in this codebase — the second copy is
   * always the one that misses a fix. `tests/console-bridge-queue.test.js` and
   * `tests/ui-command-queue.test.js` pin the behaviour from both ends.
   */
  function createQueue(label) {
    /** id -> entry. Insertion-ordered, so the first queued entry is the next one out. */
    const entries = new Map();
    let nextId = 1;

    return {
      entries: entries,
      add(fields) {
        const entry = Object.assign({
          id: nextId++,
          status: 'queued',
          ok: null,
          error: null,
          buildId: null,
          enqueuedAt: Date.now(),
          startedAt: null,
          finishedAt: null
        }, fields);
        entries.set(entry.id, entry);
        return entry;
      },
      get(id) {
        return entries.get(Number(id));
      },
      takeNext() {
        for (const entry of entries.values()) {
          if (entry.status === 'queued') {
            entry.status = 'running';
            entry.startedAt = Date.now();
            return entry;
          }
        }
        return null;
      },
      /** Mark entries the plugin picked up but never reported back on. */
      expire(now) {
        for (const entry of entries.values()) {
          if (entry.status !== 'done' && now - entry.enqueuedAt > JOB_TIMEOUT_MS) {
            entry.status = 'done';
            entry.ok = false;
            entry.output = '';
            entry.error = 'Timed out after ' + JOB_TIMEOUT_MS + 'ms without a result from the plugin.';
            entry.finishedAt = now;
          }
        }
      },
      complete(entry, parsed) {
        entry.status = 'done';
        entry.ok = parsed.ok === true;
        entry.output = typeof parsed.output === 'string' ? parsed.output : '';
        entry.error = parsed.error != null ? String(parsed.error) : null;
        // Which build ran it, so the CLI can spot a plugin that needs reloading.
        entry.buildId = parsed.buildId != null ? String(parsed.buildId) : null;
        entry.finishedAt = Date.now();
        return entry;
      }
    };
  }

  const jobQueue = createQueue('job');
  const uiQueue = createQueue('ui');
  const jobs = jobQueue.entries;

  /**
   * Which plugin instance is out there, and when it was last heard from.
   *
   * **Why it exists.** `figma-sync` used to answer "has the reload happened yet?" by enqueuing a UI
   * command and waiting for the iframe to poll for it. A backgrounded Figma throttles that poll to
   * roughly once a minute, so a reload that took a second was reported minutes later — which is
   * long enough that the loop stopped being usable and turned back into "tell me when you're done".
   *
   * The plugin now says so itself: one POST at boot, before it can be asked anything. That is the
   * signal, and it costs one local HTTP call to read.
   *
   * Two fields, because one cannot answer the question:
   *   `buildId`  — which bundle announced. Says *what* is running.
   *   `lastSeen` — any request from the plugin, announce or poll. Says whether it is still there,
   *                so a build id left behind by a Figma that has since been closed is not mistaken
   *                for a live plugin.
   */
  const presence = { buildId: null, announcedAt: null, lastSeen: null };

  /** Called on every plugin-originated request. The plugin polls, so this ticks on its own. */
  function sawPlugin(now) {
    presence.lastSeen = now;
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
    const now = Date.now();
    jobQueue.expire(now);
    uiQueue.expire(now);

    // --- Presence ------------------------------------------------------------

    // The plugin, on boot: "I am here, running this build." Fire and forget from its side.
    if (req.method === 'POST' && url === '/hello') {
      readBody(req, (body) => {
        let parsed = {};
        try {
          parsed = body ? JSON.parse(body) : {};
        } catch (err) {
          json(res, 400, { error: 'Hello body is not JSON: ' + err.message }, corsHeaders);
          return;
        }
        presence.buildId = parsed.buildId != null ? String(parsed.buildId) : null;
        presence.announcedAt = now;
        sawPlugin(now);
        json(res, 200, { ok: true }, corsHeaders);
      });
      return;
    }

    // The CLI: "is a plugin out there, and which build is it?" `now` travels with the answer so the
    // caller measures staleness against this clock rather than its own.
    if (req.method === 'GET' && url === '/presence') {
      json(res, 200, {
        buildId: presence.buildId,
        announcedAt: presence.announcedAt,
        lastSeen: presence.lastSeen,
        now: now
      }, corsHeaders);
      return;
    }

    // --- Job queue -----------------------------------------------------------

    // The plugin asks for work. 204 rather than an empty job so an idle poll is cheap.
    if (req.method === 'GET' && url === '/jobs/next') {
      sawPlugin(now);
      const job = jobQueue.takeNext();
      if (!job) {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
      }
      json(res, 200, { id: job.id, script: job.script, code: job.code, args: job.args }, corsHeaders);
      return;
    }

    // The CLI asks how a job went.
    const statusMatch = req.method === 'GET' && url.match(/^\/jobs\/(\d+)$/);
    if (statusMatch) {
      const job = jobQueue.get(statusMatch[1]);
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
        const job = jobQueue.get(resultMatch[1]);
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
        jobQueue.complete(job, parsed);
        // A result carries the build that produced it, so a plugin too old to announce is still
        // identified — which is what makes the very reload that *introduces* announcing detectable.
        if (job.buildId) presence.buildId = job.buildId;
        sawPlugin(Date.now());
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
        const job = jobQueue.add({
          script: parsed.script != null ? String(parsed.script) : null,
          code: parsed.code != null ? String(parsed.code) : null,
          args: parsed.args != null ? parsed.args : null,
          output: ''
        });
        json(res, 201, { id: job.id }, corsHeaders);
      });
      return;
    }

    // --- UI commands ---------------------------------------------------------

    if (req.method === 'GET' && url === '/ui/next') {
      sawPlugin(now);
      const cmd = uiQueue.takeNext();
      if (!cmd) {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
      }
      json(res, 200, { id: cmd.id, command: cmd.command, args: cmd.args }, corsHeaders);
      return;
    }

    const uiStatusMatch = req.method === 'GET' && url.match(/^\/ui\/(\d+)$/);
    if (uiStatusMatch) {
      const cmd = uiQueue.get(uiStatusMatch[1]);
      if (!cmd) {
        json(res, 404, { error: 'No such UI command' }, corsHeaders);
        return;
      }
      json(res, 200, cmd, corsHeaders);
      return;
    }

    const uiResultMatch = req.method === 'POST' && url.match(/^\/ui\/(\d+)\/result$/);
    if (uiResultMatch) {
      readBody(req, (body) => {
        const cmd = uiQueue.get(uiResultMatch[1]);
        if (!cmd) {
          json(res, 404, { error: 'No such UI command' }, corsHeaders);
          return;
        }
        let parsed = {};
        try {
          parsed = body ? JSON.parse(body) : {};
        } catch (err) {
          json(res, 400, { error: 'Result body is not JSON: ' + err.message }, corsHeaders);
          return;
        }
        uiQueue.complete(cmd, parsed);
        if (cmd.buildId) presence.buildId = cmd.buildId;
        sawPlugin(Date.now());
        // A UI command answers with a value, not a log. Kept separate from `output` so a
        // structured answer is never flattened into a string on the way back.
        cmd.result = parsed.result !== undefined ? parsed.result : null;
        res.writeHead(204, corsHeaders);
        res.end();
      });
      return;
    }

    if (req.method === 'POST' && url === '/ui') {
      readBody(req, (body) => {
        let parsed = {};
        try {
          parsed = body ? JSON.parse(body) : {};
        } catch (err) {
          json(res, 400, { error: 'Command body is not JSON: ' + err.message }, corsHeaders);
          return;
        }
        if (!parsed.command || typeof parsed.command !== 'string') {
          json(res, 400, { error: 'A UI command needs a "command" name.' }, corsHeaders);
          return;
        }
        // Named, never evaluated. The plugin refuses a name it does not know, so an unknown
        // command is an error rather than a hole.
        const cmd = uiQueue.add({
          command: parsed.command,
          args: parsed.args != null ? parsed.args : null,
          result: null,
          output: ''
        });
        json(res, 201, { id: cmd.id }, corsHeaders);
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
    console.log('UI commands: POST /ui to drive the plugin UI (npm run figma:ui)');
  });
}

module.exports = { createBridgeServer, PORT, JOB_TIMEOUT_MS, assertDevBuild, manifestAllowsLocalhost };
