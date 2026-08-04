/**
 * Fixture tests for the job queue in figma-console-server.js.
 *
 * The queue is the only path from a terminal into a real Figma run, so a bug here looks
 * like "the plugin never picked it up" — indistinguishable from Figma being closed. These
 * tests pin the protocol both sides rely on, over real HTTP on an ephemeral port.
 *
 * They also pin that the original console-log behaviour still works, since the queue routes
 * were added in front of a handler that used to treat *any* POST as a log append.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createBridgeServer } = require('../figma-console-server.js');

/** Start a bridge on an ephemeral port with its own log file. */
async function withBridge(run) {
  const logFile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'codefig-bridge-')),
    'figma-console.log'
  );
  const { server, jobs } = createBridgeServer({ logFile });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    await run({ base, logFile, jobs });
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
  // /log answers text/plain, the queue answers JSON — parse only what claims to be JSON.
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  return { status: res.status, text, json: isJson && text ? JSON.parse(text) : null };
}

test('a job round-trips: enqueue → plugin picks it up → result → CLI reads it', async () => {
  await withBridge(async ({ base }) => {
    const created = await req(base, 'POST', '/jobs', { script: '_run-all-tests' });
    assert.equal(created.status, 201);
    const id = created.json.id;
    assert.ok(id, 'enqueue returns an id');

    const queued = await req(base, 'GET', '/jobs/' + id);
    assert.equal(queued.json.status, 'queued');

    // The plugin side.
    const taken = await req(base, 'GET', '/jobs/next');
    assert.equal(taken.status, 200);
    assert.equal(taken.json.id, id);
    assert.equal(taken.json.script, '_run-all-tests');

    // Taking it marks it running, so a second poller cannot run the same job twice.
    const empty = await req(base, 'GET', '/jobs/next');
    assert.equal(empty.status, 204, 'nothing left to hand out');
    assert.equal((await req(base, 'GET', '/jobs/' + id)).json.status, 'running');

    const posted = await req(base, 'POST', '/jobs/' + id + '/result', {
      ok: true,
      output: 'CODEFIG_TEST_RESULT {"pass":7,"fail":0}'
    });
    assert.equal(posted.status, 204);

    const done = await req(base, 'GET', '/jobs/' + id);
    assert.equal(done.json.status, 'done');
    assert.equal(done.json.ok, true);
    assert.match(done.json.output, /CODEFIG_TEST_RESULT/);
    assert.ok(done.json.finishedAt >= done.json.startedAt);
  });
});

test('an idle queue answers 204, so polling costs nothing', async () => {
  await withBridge(async ({ base }) => {
    const res = await req(base, 'GET', '/jobs/next');
    assert.equal(res.status, 204);
    assert.equal(res.text, '');
  });
});

test('jobs come out in the order they went in', async () => {
  await withBridge(async ({ base }) => {
    const a = (await req(base, 'POST', '/jobs', { script: 'first' })).json.id;
    const b = (await req(base, 'POST', '/jobs', { script: 'second' })).json.id;
    assert.equal((await req(base, 'GET', '/jobs/next')).json.id, a);
    assert.equal((await req(base, 'GET', '/jobs/next')).json.id, b);
  });
});

test('raw code is accepted as well as a script name', async () => {
  await withBridge(async ({ base }) => {
    const created = await req(base, 'POST', '/jobs', { code: 'console.log(1)' });
    assert.equal(created.status, 201);
    const taken = await req(base, 'GET', '/jobs/next');
    assert.equal(taken.json.code, 'console.log(1)');
    assert.equal(taken.json.script, null);
  });
});

test('a job with neither script nor code is rejected, not queued', async () => {
  await withBridge(async ({ base }) => {
    const res = await req(base, 'POST', '/jobs', { args: { a: 1 } });
    assert.equal(res.status, 400);
    assert.match(res.json.error, /needs a "script" name or raw "code"/);
    assert.equal((await req(base, 'GET', '/jobs/next')).status, 204, 'nothing was queued');
  });
});

test('malformed JSON is a 400, not a crash', async () => {
  await withBridge(async ({ base }) => {
    const res = await fetch(base + '/jobs', {
      method: 'POST',
      body: '{not json',
      headers: { 'Content-Type': 'application/json' }
    });
    assert.equal(res.status, 400);
    assert.match(JSON.parse(await res.text()).error, /not JSON/);
  });
});

test('a failing run reports ok:false with its error, and the CLI can tell', async () => {
  await withBridge(async ({ base }) => {
    const id = (await req(base, 'POST', '/jobs', { script: 'broken' })).json.id;
    await req(base, 'GET', '/jobs/next');
    await req(base, 'POST', '/jobs/' + id + '/result', {
      ok: false,
      output: 'partial log',
      error: 'ReferenceError: nope is not defined'
    });
    const done = await req(base, 'GET', '/jobs/' + id);
    assert.equal(done.json.ok, false);
    assert.match(done.json.error, /ReferenceError/);
    assert.equal(done.json.output, 'partial log');
  });
});

test('results and status for an unknown job are 404, not a silent success', async () => {
  await withBridge(async ({ base }) => {
    assert.equal((await req(base, 'GET', '/jobs/9999')).status, 404);
    assert.equal((await req(base, 'POST', '/jobs/9999/result', { ok: true })).status, 404);
  });
});

test('the console log still works: POST / appends, GET /log serves', async () => {
  await withBridge(async ({ base, logFile }) => {
    const res = await fetch(base, {
      method: 'POST',
      body: '[UI] hello\n',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
    assert.equal(res.status, 204);
    assert.equal(fs.readFileSync(logFile, 'utf8'), '[UI] hello\n');

    const served = await req(base, 'GET', '/log');
    assert.equal(served.status, 200);
    assert.equal(served.text, '[UI] hello\n');

    // Appends, never truncates — the log is a running record across many runs.
    await fetch(base, { method: 'POST', body: 'second\n' });
    assert.equal(fs.readFileSync(logFile, 'utf8'), '[UI] hello\nsecond\n');
  });
});

test('a log POST is not mistaken for a job, and vice versa', async () => {
  await withBridge(async ({ base, logFile }) => {
    // The log handler used to catch every POST; /jobs has to win.
    await req(base, 'POST', '/jobs', { script: 'x' });
    assert.equal(fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '', '');

    await fetch(base + '/log-something-else', { method: 'POST', body: 'log line\n' });
    assert.match(fs.readFileSync(logFile, 'utf8'), /log line/);
  });
});

test('a query string does not defeat routing', async () => {
  await withBridge(async ({ base }) => {
    await req(base, 'POST', '/jobs', { script: 'x' });
    const taken = await req(base, 'GET', '/jobs/next?since=123');
    assert.equal(taken.status, 200);
    assert.equal(taken.json.script, 'x');
  });
});

test('CORS headers are present on every response shape', async () => {
  await withBridge(async ({ base }) => {
    for (const [method, urlPath] of [['GET', '/jobs/next'], ['GET', '/log'], ['OPTIONS', '/jobs']]) {
      const res = await fetch(base + urlPath, { method });
      assert.equal(
        res.headers.get('access-control-allow-origin'),
        '*',
        `${method} ${urlPath} is missing CORS`
      );
    }
  });
});
