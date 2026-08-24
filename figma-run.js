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

const { PORT, assertDevBuild } = require('./figma-console-server.js');
const { buildRunPrelude, findConfigVarName, findFromFilePath, isTestFileName } = require('./run-prelude.js');
const { findAllScripts } = require('./validate-scripts.js');
const BASE = 'http://127.0.0.1:' + PORT;

/** Above the plugin's own 120s job timeout, so its explanation wins over ours. */
const DEFAULT_TIMEOUT_MS = 130000;
const POLL_MS = 500;

/** The build id `npm run build:dev` last wrote, or null if there is no dist/. */
function currentBuildId() {
  try {
    return fs.readFileSync(path.join(__dirname, 'dist', 'build-id.txt'), 'utf8').trim();
  } catch (err) {
    return null;
  }
}

/**
 * Warn when the plugin that ran the job came from an older build than the one on disk.
 * This is the loop's most common trap: a dev build rewrites dist/, the open plugin keeps
 * running the previous bundle, and a newly added library looks like a broken import.
 */
function warnIfStale(reportedBuildId) {
  const onDisk = currentBuildId();
  if (!onDisk || !reportedBuildId || reportedBuildId === onDisk) return false;
  console.log(
    '\n⚠️  The plugin is running an older build than dist/ (plugin ' + reportedBuildId +
      ', on disk ' + onDisk + ').\n' +
      '   Reload CodeFig in Figma — close and reopen it — then run this again.'
  );
  return true;
}

function parseArgs(argv) {
  const out = {
    script: null, code: null, timeout: DEFAULT_TIMEOUT_MS, quiet: false,
    fromFile: false, config: null, force: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--code') out.code = argv[++i];
    else if (a === '--file') {
      const file = argv[++i];
      out.code = fs.readFileSync(path.resolve(file), 'utf8');
    } else if (a === '--timeout') out.timeout = Number(argv[++i]);
    else if (a === '--quiet') out.quiet = true;
    else if (a === '--from-file') out.fromFile = true;
    else if (a === '--config') out.config = argv[++i];
    else if (a === '--force') out.force = true;
    else if (!a.startsWith('-') && !out.script) out.script = a;
  }
  return out;
}

/** The source on disk for a script the CLI was given by name or filename. */
function findScriptSource(name) {
  const wanted = String(name || '').toLowerCase();
  const scripts = findAllScripts(path.join(__dirname, 'scripts'));
  for (const script of scripts) {
    const base = String(script.filename || '').replace(/\.[^.]+$/, '').toLowerCase();
    if (base === wanted || String(script.name || '').toLowerCase() === wanted) return script;
  }
  for (const script of scripts) {
    if (String(script.name || '').toLowerCase().indexOf(wanted) !== -1) return script;
  }
  return null;
}

/** A JSON config from a path or an inline blob. */
function readConfigArg(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  if (trimmed.charAt(0) === '{') return JSON.parse(trimmed);
  return JSON.parse(fs.readFileSync(path.resolve(trimmed), 'utf8'));
}

/**
 * The name of the file the plugin is open on.
 *
 * Costs one tiny read-only job, and buys the guard below. `figma:run -- spacing` writes
 * variables into whatever file happens to be open — a two-word command with a document-wide
 * effect — and DEFERRED.md has long listed running a script's *source defaults* as the
 * dangerous input. This is the missing guard for it.
 */
async function openFileName(timeout) {
  const job = await runJob({
    code: 'console.log("CODEFIG_FILE " + figma.root.name); window.codefigRunComplete();',
    script: 'read file name'
  }, timeout);
  if (!job.ok) throw new Error(job.error || 'could not read the open file.');
  const line = String(job.output || '').split('\n').find((l) => l.indexOf('CODEFIG_FILE ') !== -1);
  if (!line) throw new Error('the plugin did not report a file name.');
  return line.slice(line.indexOf('CODEFIG_FILE ') + 'CODEFIG_FILE '.length).trim();
}

/** Queue a job and wait for it, without the reporting `main` does. */
async function runJob(body, timeout) {
  const created = await fetch(BASE + '/jobs', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' }
  });
  if (created.status !== 201) throw new Error(await created.text());
  const { id } = await created.json();
  const deadline = Date.now() + timeout;
  for (;;) {
    if (Date.now() > deadline) throw new Error('Timed out after ' + timeout + 'ms');
    const job = await (await fetch(BASE + '/jobs/' + id)).json();
    if (job.status === 'done') return job;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

/**
 * Ask the plugin for this file's config, through the same `readFoundation` the sync button uses.
 * The payload comes back on a console line, the way the test runner reports its results.
 */
async function loadConfigFromFile(fromFilePath, timeout) {
  const domain = /^domains\.([A-Za-z0-9_$]+)/.exec(fromFilePath || '');
  const code = [
    '@import { foundationConfigPayload } from "@Foundation"',
    '(async function () {',
    '  var payload = await foundationConfigPayload(' + (domain ? JSON.stringify(domain[1]) : 'null') + ');',
    '  console.log("CODEFIG_CONFIG " + JSON.stringify(payload));',
    '  window.codefigRunComplete();',
    '})();'
  ].join('\n');

  const job = await runJob({ code, script: 'read foundation config' }, timeout);
  if (!job.ok) throw new Error(job.error || 'the plugin could not read this file\'s config.');

  const line = String(job.output || '').split('\n').find((l) => l.indexOf('CODEFIG_CONFIG ') !== -1);
  if (!line) throw new Error('the plugin did not report a config.');
  return JSON.parse(line.slice(line.indexOf('CODEFIG_CONFIG ') + 'CODEFIG_CONFIG '.length));
}

function usage() {
  console.error(`Usage: node figma-run.js <script-name>
       node figma-run.js --code "console.log(1); window.codefigRunComplete();"
       node figma-run.js --file path/to/spec.js

Options:
  --force         Run a named script against a file that is not a codefig-test file
  --from-file     Load this file's saved config first, the way the sync button does
  --config <p>    Run with this config (a JSON file or an inline blob); beats --from-file
  --timeout <ms>  Wait this long for a result (default ${DEFAULT_TIMEOUT_MS})
  --quiet         Print only the verdict

With neither --from-file nor --config, the script runs its own config exactly as written.

The plugin must be open in Figma with \`npm run dev\` running — this cannot launch Figma.`);
}

async function main() {
  assertDevBuild();
  const args = parseArgs(process.argv.slice(2));
  if (!args.script && !args.code) {
    usage();
    process.exit(1);
  }

  // A named script is a shipped generator: assume it writes. Snippets through --code and
  // --file are ad hoc and their author can see what they do, so they are not gated.
  if (args.script) {
    let fileName;
    try {
      fileName = await openFileName(args.timeout);
    } catch (err) {
      console.error('❌ Could not check which file is open: ' + (err && err.message ? err.message : err));
      process.exit(1);
    }
    console.log('Target: ' + fileName);
    if (!isTestFileName(fileName)) {
      if (!args.force) {
        console.error(
          `\n❌ "${fileName}" is not a codefig-test file, and \`${args.script}\` writes to the document.\n` +
            '   Open a file whose name contains `codefig-test`, or pass --force if you meant this one.\n'
        );
        process.exit(1);
      }
      console.log('--force: writing to a file that is not a codefig-test file.');
    }
  }

  // Resolve a config, if one was asked for. With no flag this stays null and the script runs
  // its own literal — the paste workflow, untouched.
  let prelude = '';
  let configSource = 'the script\'s own config';
  if ((args.config || args.fromFile) && !args.script) {
    console.error('❌ --config and --from-file need a script name; they have nothing to override in --code or --file.');
    process.exit(1);
  }
  if (args.config || args.fromFile) {
    const script = findScriptSource(args.script);
    if (!script) {
      console.error(`❌ No script matching "${args.script}" on disk, so its config variable cannot be found.`);
      process.exit(1);
    }
    const configVar = findConfigVarName(script.code);
    if (!configVar) {
      console.error(`❌ "${script.name}" has no config block to override.`);
      process.exit(1);
    }

    let config = null;
    if (args.config) {
      try {
        config = readConfigArg(args.config);
        configSource = 'the config you passed';
      } catch (err) {
        console.error('❌ Could not read --config: ' + (err && err.message ? err.message : err));
        process.exit(1);
      }
    } else {
      const fromFilePath = findFromFilePath(script.code);
      try {
        const payload = await loadConfigFromFile(fromFilePath, args.timeout);
        config = payload.config || (fromFilePath ? null : payload.v1);
        if (!config) {
          console.error(
            '❌ This file has no saved config for ' + (fromFilePath || 'this script') + '.\n' +
              '   Run the script once, or drop --from-file to use its own config.'
          );
          process.exit(1);
        }
        configSource = "this file's saved config";
      } catch (err) {
        console.error('❌ Could not read the config from the file: ' + (err && err.message ? err.message : err));
        process.exit(1);
      }
    }
    prelude = buildRunPrelude(configVar, config);
    if (!prelude) {
      console.error('❌ Could not build a config prelude for ' + configVar + '.');
      process.exit(1);
    }
  }
  console.log('Config: ' + configSource + '.');

  let created;
  try {
    created = await fetch(BASE + '/jobs', {
      method: 'POST',
      body: JSON.stringify({ script: args.script, code: args.code, args: prelude ? { prelude } : null }),
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
      warnIfStale(job.buildId);
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
