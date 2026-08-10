#!/usr/bin/env node
/**
 * Drive the open plugin's UI from the terminal, and print what it answers.
 *
 * The mirror of `figma-run.js`, for the iframe rather than the sandbox. Plan 12 made scripts
 * runnable from a terminal; everything it could not reach — button state, the import path, the
 * config editor, panel refresh — stayed reachable only by a person clicking, which made that
 * person the instrument. Five bugs this month lived there, and the bridge one took three exchanges
 * to locate because the only instrument was a toast.
 *
 * Like `figma-run.js`, this launches nothing: the plugin must be open with `npm run dev` running.
 *
 * Usage:
 *   node figma-ui.js <command> [key=value ...]
 *   node figma-ui.js listScripts
 *   node figma-ui.js selectScript name=Spacing
 *   node figma-ui.js readConfig
 *   node figma-ui.js writeConfig --text-file ./block.txt
 *   node figma-ui.js readInfoPanel
 *   node figma-ui.js pressImport
 *
 * Options:
 *   --timeout <ms>   how long to wait for an answer (default 20000)
 *   --json           print the raw answer as JSON rather than formatted
 *   --text-file <p>  read a file into the `text` argument (for writeConfig)
 *
 * Commands are **named, not evaluated**: there is deliberately no way to send JavaScript for the
 * iframe to run. Every UI action worth driving is nameable, so an eval channel would be a strictly
 * larger hole for no extra reach.
 */

const fs = require('fs');
const path = require('path');

const { PORT } = require('./figma-console-server.js');
const BASE = 'http://127.0.0.1:' + PORT;

/** A UI command is a DOM operation, not a document walk — it should answer in milliseconds. */
const DEFAULT_TIMEOUT_MS = 20000;
const POLL_MS = 200;

/**
 * The commands the plugin implements.
 *
 * Duplicated from `_codefigUiCommandNames()` in `src/ui.html` because the two run in different
 * processes and cannot share a module. `tests/ui-command-surface.test.js` fails when they diverge,
 * which is the same treatment the config-ui facade got after its hand-written list caused a bug.
 */
const COMMANDS = {
  listScripts: 'every script in the sidebar, with its type',
  selectScript: 'open a script — name=<script name>',
  readConfig: 'the text in the configuration editor',
  writeConfig: 'replace it — text=<...> or --text-file <path>',
  readInfoPanel: 'the results panel: title, text, whose results they are',
  readPreview: 'the Configuration tab preview: whether it is shown, and its text',
  readTabs: 'which tabs this script has and which is current',
  pressImport: "press the import button and wait for it to settle",
  readButtonState: 'the import button state, derived — visible, dot, reason'
};

function currentBuildId() {
  try {
    return fs.readFileSync(path.join(__dirname, 'dist', 'build-id.txt'), 'utf8').trim();
  } catch (err) {
    return null;
  }
}

/** The loop's most common trap, and the same warning `figma-run.js` prints. */
function warnIfStale(reportedBuildId) {
  const onDisk = currentBuildId();
  if (!onDisk || !reportedBuildId || reportedBuildId === onDisk) return;
  console.log(
    '\n⚠️  The plugin is running an older build than dist/ (plugin ' + reportedBuildId +
      ', on disk ' + onDisk + ').\n' +
      '   Reload CodeFig in Figma — close and reopen it — then run this again.'
  );
}

function usage() {
  console.log('Usage: node figma-ui.js <command> [key=value ...]\n');
  console.log('Commands:');
  const width = Math.max(...Object.keys(COMMANDS).map((c) => c.length));
  for (const name of Object.keys(COMMANDS)) {
    console.log('  ' + name.padEnd(width + 2) + COMMANDS[name]);
  }
  console.log('\nOptions: --timeout <ms>  --json  --text-file <path>');
}

function parseArgs(argv) {
  const out = { command: null, args: {}, timeout: DEFAULT_TIMEOUT_MS, json: false };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--timeout') {
      out.timeout = Number(argv[++i]) || DEFAULT_TIMEOUT_MS;
    } else if (token === '--json') {
      out.json = true;
    } else if (token === '--text-file') {
      out.args.text = fs.readFileSync(argv[++i], 'utf8');
    } else if (token.indexOf('=') !== -1) {
      const at = token.indexOf('=');
      out.args[token.slice(0, at)] = token.slice(at + 1);
    } else if (!out.command) {
      out.command = token;
    }
  }
  return out;
}

/** Formatted rather than raw, because a wall of JSON is the thing this replaces. */
function print(command, result) {
  if (result === null || result === undefined) {
    console.log('(no answer)');
    return;
  }
  if (Array.isArray(result)) {
    for (const entry of result) {
      console.log(typeof entry === 'object' ? JSON.stringify(entry) : String(entry));
    }
    return;
  }
  if (typeof result !== 'object') {
    console.log(String(result));
    return;
  }
  for (const key of Object.keys(result)) {
    const value = result[key];
    if (typeof value === 'string' && value.indexOf('\n') !== -1) {
      console.log(key + ':');
      console.log(value.replace(/^/gm, '  '));
    } else {
      console.log(key + ': ' + (typeof value === 'object' ? JSON.stringify(value) : String(value)));
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.command) {
    usage();
    process.exit(1);
  }
  if (!Object.prototype.hasOwnProperty.call(COMMANDS, args.command)) {
    console.error('❌ Unknown command "' + args.command + '".\n');
    usage();
    process.exit(1);
  }

  let created;
  try {
    created = await fetch(BASE + '/ui', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: args.command, args: args.args })
    });
  } catch (err) {
    console.error(
      '❌ The dev bridge is not listening on ' + PORT + '. Start it with `npm run dev`.'
    );
    process.exit(1);
  }
  if (!created.ok) {
    const body = await created.text();
    console.error('❌ The bridge refused the command: ' + body);
    process.exit(1);
  }

  // A bridge started before the /ui routes existed treats any POST as a log append: it answers
  // 200 with an empty body and quietly writes the command into figma-console.log. Without this
  // check that surfaces as "Unexpected end of JSON input", which says nothing about the cause.
  const createdBody = await created.text();
  let id;
  try {
    id = JSON.parse(createdBody).id;
  } catch (err) {
    console.error(
      '❌ The dev bridge does not have the /ui routes.\n' +
        '   It is an older figma-console-server.js — `npm run dev` does not watch that file.\n' +
        '   Restart `npm run dev`, then run this again.'
    );
    process.exit(1);
  }
  if (id == null) {
    console.error('❌ The bridge accepted the command but returned no id: ' + createdBody);
    process.exit(1);
  }
  console.log('→ ' + args.command + ' queued. Waiting for the plugin…');

  const deadline = Date.now() + args.timeout;
  for (;;) {
    if (Date.now() > deadline) {
      console.error(
        '\n❌ No answer within ' + args.timeout + 'ms.\n' +
          '   Is the plugin open, on a dev build? A UI command needs the iframe alive, not just the bridge.'
      );
      process.exit(1);
    }
    const res = await fetch(BASE + '/ui/' + id);
    const cmd = await res.json();
    if (cmd.status === 'done') {
      warnIfStale(cmd.buildId);
      if (!cmd.ok) {
        console.error('\n❌ ' + (cmd.error || 'The command failed with no message.'));
        process.exit(1);
      }
      console.log('');
      if (args.json) console.log(JSON.stringify(cmd.result, null, 2));
      else print(args.command, cmd.result);
      process.exit(0);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('❌ ' + (err && err.message ? err.message : err));
    process.exit(1);
  });
}

module.exports = { COMMANDS };
