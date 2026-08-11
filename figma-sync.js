#!/usr/bin/env node
/**
 * Wait until the open plugin is running the build that is on disk.
 *
 * **Figma cannot reload a plugin from outside it.** There is no API for a plugin to relaunch
 * itself, and `figma_reload_plugin` in the MCP tooling refreshes the *Desktop Bridge* plugin's UI
 * iframe in whichever file that bridge monitors — not CodeFig, and not its `code.js`. Both were
 * tried; neither reaches it. So the click stays.
 *
 * What does not have to stay is the conversation around the click. Instead of "I built, please
 * reload, tell me when, then I will verify", this blocks until the plugin reports the build id in
 * `dist/build-id.txt` and then exits — so a verification script can be a single command that
 * happens to pause in the middle, and whoever is at the keyboard reloads whenever they notice.
 *
 * It also closes the hole that made this necessary twice today: `figma-run.js` and `figma-ui.js`
 * *warn* about a stale build and carry on, so a result can look verified when it was produced by
 * code that is no longer on disk. Put this in front and that cannot happen.
 *
 * Usage:
 *   node figma-sync.js                 wait for the plugin to match dist/
 *   node figma-sync.js --timeout 60000 give up after a minute (default 10 minutes)
 *   node figma-sync.js --quiet         no instruction line, just the exit code
 */

const fs = require('fs');
const path = require('path');

const { PORT } = require('./figma-console-server.js');
const BASE = 'http://127.0.0.1:' + PORT;

const DEFAULT_TIMEOUT_MS = 600000;
/** Slow on purpose: each tick enqueues a command, and a throttled iframe answers about once a minute. */
const POLL_MS = 3000;

function buildIdOnDisk() {
  try {
    return fs.readFileSync(path.join(__dirname, 'dist', 'build-id.txt'), 'utf8').trim();
  } catch (err) {
    return null;
  }
}

/** Ask the plugin anything cheap; all that matters is the build id it stamps on the answer. */
async function reportedBuildId(timeoutMs) {
  let created;
  try {
    created = await fetch(BASE + '/ui', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'readTabs' })
    });
  } catch (err) {
    return { error: 'bridge-down' };
  }
  const text = await created.text();
  let id;
  try {
    id = JSON.parse(text).id;
  } catch (err) {
    return { error: 'no-ui-routes' };
  }

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (Date.now() > deadline) return { error: 'no-answer' };
    const cmd = await (await fetch(BASE + '/ui/' + id)).json();
    if (cmd.status === 'done') return { buildId: cmd.buildId || null };
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const quiet = argv.indexOf('--quiet') !== -1;
  const at = argv.indexOf('--timeout');
  const timeout = at === -1 ? DEFAULT_TIMEOUT_MS : Number(argv[at + 1]) || DEFAULT_TIMEOUT_MS;

  const wanted = buildIdOnDisk();
  if (!wanted) {
    console.error('❌ No dist/build-id.txt. Run `npm run build:dev` first.');
    process.exit(1);
  }

  const deadline = Date.now() + timeout;
  let asked = false;

  for (;;) {
    const answer = await reportedBuildId(15000);

    if (answer.buildId === wanted) {
      if (!quiet) console.log('✅ The plugin is running ' + wanted + '.');
      process.exit(0);
    }

    if (!asked && !quiet) {
      if (answer.error === 'bridge-down') {
        console.log('The dev bridge is not listening. Start `npm run dev`, then reload CodeFig.');
      } else if (answer.error === 'no-ui-routes') {
        console.log('The bridge predates the /ui routes. Restart `npm run dev`.');
      } else if (answer.error === 'no-answer') {
        console.log('No answer from the plugin. Open CodeFig on a dev build, and bring Figma to the');
        console.log('front — a backgrounded page has its timers throttled.');
      } else {
        console.log('⏳ Reload CodeFig in Figma — close and reopen it.');
        console.log('   plugin ' + (answer.buildId || 'unknown') + ' → waiting for ' + wanted);
      }
      console.log('   (this command waits, so nothing else needs saying)');
      asked = true;
    }

    if (Date.now() > deadline) {
      console.error('\n❌ Gave up after ' + Math.round(timeout / 1000) + 's. The plugin is still on ' +
        (answer.buildId || 'an unknown build') + '.');
      process.exit(1);
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

module.exports = { buildIdOnDisk };
