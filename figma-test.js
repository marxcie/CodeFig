#!/usr/bin/env node
/**
 * Run the in-Figma spec suite (`scripts/_TESTS/`) and exit on the result.
 *
 * Specs are **not** shipped — that is the point of the `_` prefix — so the plugin cannot
 * resolve them by name. Each spec's source is sent to the queue as raw code instead, which
 * also means the runner and the aggregation live here rather than in a script inside Figma.
 * Their `@import`s still resolve at run time against the *shipped* libraries, which is why
 * `@test-harness.js` has no underscore.
 *
 * Requires `npm run dev` and the plugin open on a dev build. Figma has no headless mode; this
 * drives a real client, it does not launch one.
 *
 * Usage:
 *   npm run test:figma                 every spec in scripts/_TESTS/
 *   npm run test:figma -- find-replace  only specs whose filename contains "find-replace"
 *
 * Options:
 *   --timeout <ms>  per-spec wait (default 130000)
 *   --verbose       print each spec's full console output, not just its summary
 */

const fs = require('fs');
const path = require('path');

const { PORT, assertDevBuild } = require('./figma-console-server.js');
const BASE = 'http://127.0.0.1:' + PORT;
const SPEC_DIR = path.join(__dirname, 'scripts', '_TESTS');
const RESULT_PREFIX = 'CODEFIG_TEST_RESULT ';
const DEFAULT_TIMEOUT_MS = 130000;
const POLL_MS = 500;

function parseArgs(argv) {
  const out = { filter: null, timeout: DEFAULT_TIMEOUT_MS, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--timeout') out.timeout = Number(argv[++i]);
    else if (a === '--verbose' || a === '-v') out.verbose = true;
    else if (!a.startsWith('-') && !out.filter) out.filter = a;
  }
  return out;
}

function findSpecs(filter) {
  if (!fs.existsSync(SPEC_DIR)) return [];
  return fs
    .readdirSync(SPEC_DIR)
    .filter((f) => f.endsWith('.js'))
    .filter((f) => !filter || f.includes(filter))
    .sort()
    .map((f) => ({ name: f.replace(/\.js$/, ''), file: path.join(SPEC_DIR, f) }));
}

/** Queue one spec's source and wait for the plugin to report back. */
async function runSpec(spec, timeout) {
  const code = fs.readFileSync(spec.file, 'utf8');
  const created = await fetch(BASE + '/jobs', {
    method: 'POST',
    body: JSON.stringify({ code, script: spec.name }),
    headers: { 'Content-Type': 'application/json' }
  });
  if (created.status !== 201) {
    return { ok: false, error: 'Could not queue: ' + (await created.text()), output: '' };
  }
  const { id } = await created.json();

  const deadline = Date.now() + timeout;
  for (;;) {
    if (Date.now() > deadline) {
      return { ok: false, error: `Timed out after ${timeout}ms`, output: '' };
    }
    const job = await (await fetch(BASE + '/jobs/' + id)).json();
    if (job.status === 'done') return job;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

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

/**
 * An undefined harness function means the import degraded, which in practice means the open
 * plugin is running a build from before the library existed. Worth saying out loud: the
 * reload step is the easiest thing to forget in this loop.
 */
function staleBuildSuspected(reason) {
  return /is not defined|not a function/.test(String(reason || ''));
}

/** Pull the harness's machine-readable line out of a run's console output. */
function parseSummary(output) {
  for (const line of String(output || '').split('\n')) {
    const at = line.indexOf(RESULT_PREFIX);
    if (at === -1) continue;
    try {
      return JSON.parse(line.slice(at + RESULT_PREFIX.length));
    } catch (err) {
      return null;
    }
  }
  return null;
}

async function main() {
  assertDevBuild();
  const args = parseArgs(process.argv.slice(2));

  const specs = findSpecs(args.filter);
  if (specs.length === 0) {
    console.error(
      args.filter
        ? `No spec in scripts/_TESTS/ matches "${args.filter}".`
        : 'No specs found in scripts/_TESTS/.'
    );
    process.exit(1);
  }

  try {
    await fetch(BASE + '/jobs/next');
  } catch (err) {
    console.error(
      `\n❌ No dev bridge on ${BASE}.\n` +
        '   Start it with `npm run dev`, then open CodeFig in Figma so it can pick up jobs.\n'
    );
    process.exit(1);
  }

  console.log(`Running ${specs.length} spec${specs.length === 1 ? '' : 's'} in Figma…\n`);

  let pass = 0;
  let fail = 0;
  let skip = 0;
  let staleBuild = false;
  const failedSpecs = [];

  for (const spec of specs) {
    const job = await runSpec(spec, args.timeout);
    const summary = parseSummary(job.output);
    if (job.buildId && currentBuildId() && job.buildId !== currentBuildId()) staleBuild = true;

    if (args.verbose && job.output) {
      console.log(job.output.replace(/^/gm, '    '));
    }

    if (!summary) {
      // No summary line: the spec died before testFinish(), which is itself the failure.
      fail++;
      failedSpecs.push(spec.name);
      console.log(`  ❌ ${spec.name} — no result reported`);
      const reason = job.error || 'the spec did not call testFinish()';
      console.log(`       ${reason}`);
      if (staleBuildSuspected(reason)) {
        console.log(
          '       ↳ A harness function being undefined usually means the open plugin predates\n' +
            '         it. Reload CodeFig in Figma (close and reopen) and run this again.'
        );
      }
      if (!args.verbose && job.output) {
        // Only real console lines — the captured output can include the spec's own source.
        const tail = job.output
          .split('\n')
          .filter((line) => /^\[(LOG|ERROR|WARN|INFO)\]/.test(line))
          .slice(-4);
        tail.forEach((line) => console.log('       ' + line));
      }
      continue;
    }

    pass += summary.pass;
    fail += summary.fail;
    skip += summary.skip || 0;
    const verdict = summary.fail > 0 ? '❌' : '✅';
    console.log(
      `  ${verdict} ${summary.suite}: ${summary.pass} passed, ${summary.fail} failed` +
        (summary.skip ? `, ${summary.skip} skipped` : '')
    );
    if (summary.fail > 0) {
      failedSpecs.push(spec.name);
      summary.cases
        .filter((c) => c.status === 'fail')
        .forEach((c) => console.log(`       ${c.name} — ${c.message}`));
    }
  }

  console.log(
    `\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed` +
      (skip ? `, ${skip} skipped` : '') +
      ` across ${specs.length} spec${specs.length === 1 ? '' : 's'}.`
  );

  if (staleBuild) {
    console.log(
      '\n⚠️  A spec ran on an older build than dist/. Reload CodeFig in Figma (close and\n' +
        '   reopen), then run this again — results above may be from stale code.'
    );
  }

  if (skip > 0) {
    console.log(
      '\n   Skipped cases need a file whose name contains "codefig-test" — they create and\n' +
        '   delete styles, variables and pages, so they refuse to touch real work.'
    );
  }

  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('figma-test:', err && err.message ? err.message : err);
  process.exit(1);
});
