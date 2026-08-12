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
/** The bridge's own memory, read over loopback. Nothing is asked of the plugin, so this can be tight. */
const POLL_MS = 300;
/**
 * How long a plugin stays "here" without a word.
 *
 * Generous, because the thing that goes quiet is a *backgrounded* Figma: its timers are throttled to
 * roughly one tick a minute, and that plugin is running perfectly well. This window only has to be
 * long enough not to call it gone.
 */
const PRESENCE_FRESH_MS = 90000;

/** What the bridge has heard from the plugin: which build announced, and how long ago. */
async function presence() {
  try {
    const res = await fetch(BASE + '/presence');
    if (res.status === 404) return { error: 'no-presence-route' };
    if (!res.ok) return { error: 'bridge-down' };
    const body = await res.json();
    return {
      buildId: body.buildId || null,
      here: body.lastSeen != null && body.now - body.lastSeen <= PRESENCE_FRESH_MS
    };
  } catch (err) {
    return { error: 'bridge-down' };
  }
}

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

  let wanted = buildIdOnDisk();
  if (!wanted) {
    console.error('❌ No dist/build-id.txt. Run `npm run build:dev` first.');
    process.exit(1);
  }

  const deadline = Date.now() + timeout;
  let asked = false;
  let probing = false;
  let seen = null;

  /**
   * The reload is **announced**, so this loop only reads what the bridge already knows — a loopback
   * call every 300ms, and nothing asked of the iframe.
   *
   * The old probe stays as a fallback, one at a time in the background, for the one case announcing
   * cannot cover: a plugin running a bundle from *before* announcing existed, which is exactly the
   * reload that introduces it. Its answer carries a build id too, and the bridge records that, so
   * the probe feeds the same loop rather than racing it.
   */
  for (;;) {
    // **Re-read on every tick.** `npm run dev` watches `src/` and `scripts/`, so a save while this is
    // waiting produces a *new* build id — and a target read once at startup is then a build that no
    // longer exists on disk and can never arrive. That is how a 600-second wait ended in "gave up"
    // while the plugin was, in fact, running the newest build. The question is always "is the plugin
    // on what is on disk *now*", so the answer has to be re-asked.
    const onDisk = buildIdOnDisk();
    if (onDisk && onDisk !== wanted) {
      if (!quiet) console.log('   (a rebuild landed — now waiting for ' + onDisk + ')');
      wanted = onDisk;
      asked = false;
    }

    const now = await presence();

    if (now.buildId === wanted && now.here) {
      if (!quiet) console.log('✅ The plugin is running ' + wanted + '.');
      process.exit(0);
    }
    if (now.buildId) seen = now.buildId;

    if (now.error === 'no-presence-route' && !probing) {
      // An old bridge has no presence to read; fall back to asking, every time round.
      probing = true;
      reportedBuildId(15000).then(function (answer) {
        if (answer.buildId === wanted) {
          if (!quiet) console.log('✅ The plugin is running ' + wanted + '.');
          process.exit(0);
        }
        if (answer.buildId) seen = answer.buildId;
        probing = false;
      });
    } else if (!now.error && !now.here && !probing) {
      // Announced nothing and said nothing: either no plugin, or one too old to announce. Asking is
      // the only way to tell those apart, and its result updates presence for the next tick.
      probing = true;
      reportedBuildId(15000).then(function (answer) {
        if (answer.buildId) seen = answer.buildId;
        probing = false;
      });
    }

    if (!asked && !quiet) {
      if (now.error === 'bridge-down') {
        console.log('The dev bridge is not listening. Start `npm run dev`, then reload CodeFig.');
      } else if (now.error === 'no-presence-route') {
        console.log('The bridge predates /presence — restart `npm run dev` for instant reload');
        console.log('detection. Falling back to asking the plugin, which a backgrounded Figma');
        console.log('answers about once a minute.');
      } else {
        console.log('⏳ Reload CodeFig in Figma — close and reopen it.');
        console.log('   plugin ' + (seen || 'unknown') + ' → waiting for ' + wanted);
      }
      console.log('   (this command waits, and returns the moment the plugin comes back)');
      asked = true;
    }

    if (Date.now() > deadline) {
      console.error('\n❌ Gave up after ' + Math.round(timeout / 1000) + 's. The plugin is still on ' +
        (seen || 'an unknown build') + '.');
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
