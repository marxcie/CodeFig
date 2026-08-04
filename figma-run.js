#!/usr/bin/env node
/**
 * Run a script inside the open Figma plugin from the terminal, and exit on its result.
 *
 * Figma has no headless mode: this does not launch anything. It hands a job to the dev
 * bridge (figma-console-server.js) and waits for the plugin — which must be open, with
 * `npm run dev` running — to pick it up, run it, and report back. Exit code 0 only if the
 * run completed without logging an error.
 *
 * Usage:
 *   node figma-run.js <script-name>        run a bundled script by name or filename
 *   node figma-run.js --code "<js>"        run a snippet verbatim
 *   node figma-run.js --file path.js       run a local file's contents
 *   npm run test:figma                     run the in-Figma test suite
 *
 * Options:
 *   --timeout <ms>   how long to wait for a result (default 130000, above the plugin's own)
 *   --quiet          print only the verdict, not the run's console output
 */

const fs = require('fs');
const path = require('path');

const { PORT } = require('./figma-console-server.js');
const BASE = 'http://127.0.0.1:' + PORT;

/** Above the plugin's own 120s job timeout, so its explanation wins over ours. */
const DEFAULT_TIMEOUT_MS = 130000;
const POLL_MS = 500;

function parseArgs(argv) {
  const out = { script: null, code: null, timeout: DEFAULT_TIMEOUT_MS, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--code') out.code = argv[++i];
    else if (a === '--file') {
      const file = argv[++i];
      out.code = fs.readFileSync(path.resolve(file), 'utf8');
    } else if (a === '--timeout') out.timeout = Number(argv[++i]);
    else if (a === '--quiet') out.quiet = true;
    else if (!a.startsWith('-') && !out.script) out.script = a;
  }
  return out;
}

function usage() {
  console.error(`Usage: node figma-run.js <script-name>
       node figma-run.js --code "console.log(1); window.codefigRunComplete();"
       node figma-run.js --file path/to/spec.js

Options:
  --timeout <ms>  Wait this long for a result (default ${DEFAULT_TIMEOUT_MS})
  --quiet         Print only the verdict

The plugin must be open in Figma with \`npm run dev\` running — this cannot launch Figma.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.script && !args.code) {
    usage();
    process.exit(1);
  }

  let created;
  try {
    created = await fetch(BASE + '/jobs', {
      method: 'POST',
      body: JSON.stringify({ script: args.script, code: args.code }),
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error(
      `\n❌ No dev bridge on ${BASE}.\n` +
        '   Start it with `npm run dev` (it runs the bridge alongside the watchers).\n'
    );
    process.exit(1);
  }

  if (created.status !== 201) {
    console.error('❌ Could not queue the job:', await created.text());
    process.exit(1);
  }

  const { id } = await created.json();
  const label = args.script ? `"${args.script}"` : 'the given code';
  console.log(`→ Queued job ${id} for ${label}. Waiting for the plugin…`);

  const deadline = Date.now() + args.timeout;
  let warned = false;
  for (;;) {
    if (Date.now() > deadline) {
      console.error(
        `\n❌ Timed out after ${args.timeout}ms.\n` +
          '   The job was queued but no plugin ran it. Is CodeFig open in Figma, on a dev build?\n' +
          '   Reload the plugin after `npm run dev` so it picks up the poller.\n'
      );
      process.exit(1);
    }

    const res = await fetch(BASE + '/jobs/' + id);
    const job = await res.json();

    if (job.status === 'running' && !warned) {
      warned = true;
      console.log('  … picked up by the plugin, running.');
    }

    if (job.status === 'done') {
      if (job.output && !args.quiet) {
        console.log('\n--- run output ---');
        console.log(job.output);
        console.log('--- end output ---\n');
      }
      if (job.ok) {
        console.log('✅ Run completed with no errors logged.');
        process.exit(0);
      }
      console.error('❌ Run failed: ' + (job.error || 'an error was logged during the run.'));
      process.exit(1);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

main().catch((err) => {
  console.error('figma-run:', err && err.message ? err.message : err);
  process.exit(1);
});
