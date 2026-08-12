/**
 * Presence: how the terminal learns that the plugin has been reloaded.
 *
 * **Figma cannot reload a plugin from outside it**, so every dev loop has a human click in the middle
 * of it. What used to make that expensive was not the click — it was finding out that it had
 * happened: `figma-sync` enqueued a UI command and waited for the iframe to poll for it, and a
 * backgrounded Figma throttles that poll to about once a minute. A one-second reload was reported
 * minutes later, and the loop stopped being worth using.
 *
 * So the plugin says so itself, with one POST at boot. Two properties matter, and neither is visible
 * from a single field:
 *
 *   - **Which build announced** — otherwise a reload cannot be told from a plugin that never left.
 *   - **Whether it is still there** — otherwise a build id left behind by a Figma that has since been
 *     closed reads as a live plugin, and the next command hangs for its full timeout instead.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createBridgeServer } = require('../figma-console-server.js');

async function withBridge(run) {
  const logFile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'codefig-presence-')),
    'figma-console.log'
  );
  const { server } = createBridgeServer({ logFile });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    await run({ base, logFile });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function req(base, method, urlPath, body) {
  const res = await fetch(base + urlPath, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }
  });
  const text = await res.text();
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  return { status: res.status, text, json: isJson && text ? JSON.parse(text) : null };
}

test('before anything has said hello, nobody is there', async () => {
  await withBridge(async ({ base }) => {
    const p = await req(base, 'GET', '/presence');
    assert.equal(p.status, 200);
    assert.equal(p.json.buildId, null);
    assert.equal(p.json.lastSeen, null, 'a bridge that has heard nothing must not claim a plugin');
  });
});

test('a hello names the build and is immediately readable', async () => {
  await withBridge(async ({ base }) => {
    const hello = await req(base, 'POST', '/hello', { buildId: '1786539159735' });
    assert.equal(hello.status, 200);

    const p = await req(base, 'GET', '/presence');
    assert.equal(p.json.buildId, '1786539159735');
    assert.ok(p.json.now - p.json.lastSeen < 1000, 'the announce is what makes it fresh');
  });
});

test('a reload replaces the build that is there', async () => {
  // The whole point: two announcements from the same window, and the second is the one that counts.
  await withBridge(async ({ base }) => {
    await req(base, 'POST', '/hello', { buildId: 'old' });
    await req(base, 'POST', '/hello', { buildId: 'new' });
    const p = await req(base, 'GET', '/presence');
    assert.equal(p.json.buildId, 'new');
  });
});

test('an ordinary poll keeps the plugin present without changing which build it is', async () => {
  await withBridge(async ({ base }) => {
    await req(base, 'POST', '/hello', { buildId: 'b1' });
    const first = await req(base, 'GET', '/presence');

    await new Promise((resolve) => setTimeout(resolve, 10));
    await req(base, 'GET', '/jobs/next');
    await req(base, 'GET', '/ui/next');

    const after = await req(base, 'GET', '/presence');
    assert.equal(after.json.buildId, 'b1');
    assert.ok(after.json.lastSeen > first.json.lastSeen, 'polling is what proves it is still there');
  });
});

test('a result identifies a plugin too old to announce', async () => {
  // The transition case, and the reason this is not announce-only: the reload that *introduces*
  // announcing is performed by a bundle that cannot announce. Its results carry a build id, so the
  // bridge learns the same fact a beat later instead of not at all.
  await withBridge(async ({ base }) => {
    const created = await req(base, 'POST', '/jobs', { script: 'anything' });
    await req(base, 'GET', '/jobs/next');
    await req(base, 'POST', '/jobs/' + created.json.id + '/result', {
      ok: true,
      output: '',
      buildId: 'from-a-result'
    });

    const p = await req(base, 'GET', '/presence');
    assert.equal(p.json.buildId, 'from-a-result');
    assert.ok(p.json.lastSeen != null);
  });
});

test('a UI command result does the same', async () => {
  await withBridge(async ({ base }) => {
    const created = await req(base, 'POST', '/ui', { command: 'readTabs' });
    await req(base, 'GET', '/ui/next');
    await req(base, 'POST', '/ui/' + created.json.id + '/result', {
      ok: true,
      result: {},
      buildId: 'ui-result'
    });

    const p = await req(base, 'GET', '/presence');
    assert.equal(p.json.buildId, 'ui-result');
  });
});

test('hello is a route, not a log line', async () => {
  // These routes were added in front of a handler that treats *any* POST as a log append, which is
  // how an unrecognised POST silently ends up inside figma-console.log instead of failing.
  await withBridge(async ({ base, logFile }) => {
    await req(base, 'POST', '/hello', { buildId: 'x' });
    const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
    assert.equal(log.indexOf('buildId'), -1, 'the announce was appended to the console log');
  });
});

test('a malformed hello is refused rather than half-recorded', async () => {
  await withBridge(async ({ base }) => {
    const res = await fetch(base + '/hello', {
      method: 'POST',
      body: 'not json',
      headers: { 'Content-Type': 'application/json' }
    });
    assert.equal(res.status, 400);
    const p = await req(base, 'GET', '/presence');
    assert.equal(p.json.buildId, null, 'a rejected announce must not leave a build id behind');
  });
});

test('the announce goes through the UI’s one guarded path to localhost', () => {
  // `tests/ui-dev-guard.test.js` owns the general rule; this pins that the new call obeys it, since
  // an ungated fetch here would run in every published build.
  const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.html'), 'utf8');
  assert.match(ui, /_codefigBridgeFetch\('\/hello'/, 'the announce is gone, or renamed');
  const direct = ui.match(/[^g]fetch\('http:\/\/localhost:8765\/hello/);
  assert.equal(direct, null, 'the announce reaches localhost without the dev guard');
});
