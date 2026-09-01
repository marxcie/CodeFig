/**
 * The UI-command queue in figma-console-server.js.
 *
 * Same reasoning as the job queue: this is the only path from a terminal into the plugin's iframe,
 * so a bug here looks like "the plugin never picked it up" — indistinguishable from Figma being
 * closed. Both queues are now one implementation (`createQueue`), and both ends are pinned so the
 * shared code cannot be changed for one caller and quietly broken for the other.
 *
 * Over real HTTP on an ephemeral port, like the job-queue tests.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createBridgeServer } = require('../figma-console-server.js');

async function withBridge(run) {
  const logFile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'codefig-bridge-')),
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
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (err) {
    json = null;
  }
  return { status: res.status, json, text };
}

test('a command is queued, handed out once, and answered', async () => {
  await withBridge(async ({ base }) => {
    const created = await req(base, 'POST', '/ui', { command: 'readConfig' });
    assert.equal(created.status, 201);
    const id = created.json.id;

    const taken = await req(base, 'GET', '/ui/next');
    assert.equal(taken.status, 200);
    assert.equal(taken.json.command, 'readConfig');
    assert.equal(taken.json.id, id);

    // Handed out once. A second poller must not get the same command — two answers for one
    // question is worse than none.
    assert.equal((await req(base, 'GET', '/ui/next')).status, 204);

    const answered = await req(base, 'POST', '/ui/' + id + '/result', {
      ok: true, result: { text: 'collectionName: "C",' }, buildId: '123'
    });
    assert.equal(answered.status, 204);

    const done = await req(base, 'GET', '/ui/' + id);
    assert.equal(done.json.status, 'done');
    assert.equal(done.json.ok, true);
    assert.deepEqual(done.json.result, { text: 'collectionName: "C",' });
    assert.equal(done.json.buildId, '123');
  });
});

test('an idle poll is a 204, not an empty command', async () => {
  await withBridge(async ({ base }) => {
    const res = await req(base, 'GET', '/ui/next');
    assert.equal(res.status, 204);
    assert.equal(res.text, '');
  });
});

test('a structured answer survives the trip', async () => {
  // `result` is separate from `output` precisely so an object is never flattened to a string on
  // the way back — the CLI formats it, and a stringified object would defeat that.
  await withBridge(async ({ base }) => {
    const { json } = await req(base, 'POST', '/ui', { command: 'readTabs' });
    await req(base, 'GET', '/ui/next');
    const payload = { current: 'configUI', tabs: ['configUI', 'source'] };
    await req(base, 'POST', '/ui/' + json.id + '/result', { ok: true, result: payload });
    const done = await req(base, 'GET', '/ui/' + json.id);
    assert.deepEqual(done.json.result, payload);
  });
});

test('a failed command carries its message, not a bare false', async () => {
  await withBridge(async ({ base }) => {
    const { json } = await req(base, 'POST', '/ui', { command: 'selectScript', args: { name: 'Nope' } });
    await req(base, 'GET', '/ui/next');
    await req(base, 'POST', '/ui/' + json.id + '/result', {
      ok: false, error: 'No script named "Nope"'
    });
    const done = await req(base, 'GET', '/ui/' + json.id);
    assert.equal(done.json.ok, false);
    assert.match(done.json.error, /No script named "Nope"/);
  });
});

test('a command with no name is refused at the door', async () => {
  await withBridge(async ({ base }) => {
    const res = await req(base, 'POST', '/ui', { args: { name: 'Spacing' } });
    assert.equal(res.status, 400);
    assert.match(res.json.error, /needs a "command" name/);
  });
});

test('a body that is not JSON is refused with the parse error', async () => {
  await withBridge(async ({ base }) => {
    const res = await fetch(base + '/ui', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not json'
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /not JSON/);
  });
});

test('asking about a command that does not exist is a 404, not a 200 with nothing', async () => {
  await withBridge(async ({ base }) => {
    assert.equal((await req(base, 'GET', '/ui/999')).status, 404);
    assert.equal((await req(base, 'POST', '/ui/999/result', { ok: true })).status, 404);
  });
});

test('commands are handed out in the order they were queued', async () => {
  await withBridge(async ({ base }) => {
    await req(base, 'POST', '/ui', { command: 'selectScript', args: { name: 'Spacing' } });
    await req(base, 'POST', '/ui', { command: 'readConfig' });
    assert.equal((await req(base, 'GET', '/ui/next')).json.command, 'selectScript');
    assert.equal((await req(base, 'GET', '/ui/next')).json.command, 'readConfig');
  });
});

test('the two queues do not share ids or steal each other’s work', async () => {
  // One implementation, two instances. A shared counter or a shared map would let a UI poll
  // pick up a script job, which would run something nobody asked to run.
  await withBridge(async ({ base }) => {
    await req(base, 'POST', '/jobs', { script: 'Spacing' });
    await req(base, 'POST', '/ui', { command: 'readConfig' });

    const uiNext = await req(base, 'GET', '/ui/next');
    assert.equal(uiNext.json.command, 'readConfig');
    assert.equal(uiNext.json.script, undefined, 'a UI poll must never receive a script job');

    const jobNext = await req(base, 'GET', '/jobs/next');
    assert.equal(jobNext.json.script, 'Spacing');
    assert.equal(jobNext.json.command, undefined);
  });
});

test('the console log still works with the UI routes in front of it', async () => {
  // The queue routes sit in front of a handler that used to treat any POST as a log append; the
  // job queue broke this once already.
  await withBridge(async ({ base, logFile }) => {
    const res = await fetch(base + '/', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'hello from the log\n'
    });
    assert.ok(res.status >= 200 && res.status < 300);
    assert.match(fs.readFileSync(logFile, 'utf8'), /hello from the log/);
  });
});
