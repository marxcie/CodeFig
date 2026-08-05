/**
 * Production build → pack → `npm version` (bump, commit, tag).
 *
 * The bump is one `npm version` call because builds write only to `dist/`. This script used
 * to bump, sync the lockfile, stage and commit by hand: `build:production` rewrote the
 * tracked `manifest.json`, so the tree was dirty by the time the bump ran and the two had
 * to be committed together. Plan 09 moved the manifest to a template — `src/manifest.json`
 * in, `dist/manifest.json` out — and the constraint went with it.
 *
 * Build and pack still run *before* the bump, which is the part worth keeping: `npm version`
 * refuses a dirty tree, and validation failing must stop the release before a tag exists.
 *
 * Usage:
 *   npm run build:release -- patch
 *   npm run build:release -- patch --push
 *
 * Options:
 *   --dry-run   Build and pack only; no version bump or git.
 *   --push      After commit + tag, git-push branch and tag (CI release zips on GitHub).
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = __dirname;

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', cwd: root, ...opts });
}

function git(args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    const err = new Error(`git ${args.join(' ')} failed (${r.status})`);
    err.status = r.status;
    throw err;
  }
  return (r.stdout || '').trim();
}

function parseArgs(argv) {
  const rest = [];
  let dryRun = false;
  let push = false;
  let bump = null;
  for (const a of argv) {
    if (a === '--dry-run' || a === '-n') dryRun = true;
    else if (a === '--push') push = true;
    else if (!a.startsWith('-')) rest.push(a);
  }
  if (rest.length === 1 && ['patch', 'minor', 'major'].includes(rest[0])) bump = rest[0];
  return { dryRun, push, bump };
}

function readPackageVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  return String(pkg.version);
}

/** Next semver for patch | minor | major (x.y.z only). */
function computeNextVersion(current, bumpType) {
  const m = String(current).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) {
    throw new Error(
      `package.json version "${current}" must look like x.y.z (no prerelease) for release.js`
    );
  }
  let major = +m[1];
  let minor = +m[2];
  let patch = +m[3];
  if (bumpType === 'patch') patch += 1;
  else if (bumpType === 'minor') {
    minor += 1;
    patch = 0;
  } else if (bumpType === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  }
  return `${major}.${minor}.${patch}`;
}

function localGitTagExists(name) {
  const r = spawnSync('git', ['tag', '-l', name], { cwd: root, encoding: 'utf8' });
  if (r.error) throw r.error;
  return Boolean((r.stdout || '').trim());
}

function assertNextReleaseTagFree(bumpType) {
  const current = readPackageVersion();
  const next = computeNextVersion(current, bumpType);
  const nextTag = `v${next}`;
  if (!localGitTagExists(nextTag)) return;

  console.error(
    `Release would create tag ${nextTag}, but that tag already exists locally.\n\n` +
      `Typical fixes:\n` +
      `  • Failed or partial run left the tag behind — remove it and retry:\n` +
      `      git tag -d ${nextTag}\n` +
      `  • That release is already done — bump package.json to match reality, or use minor/major.\n` +
      `  • Tag exists only on GitHub and you need to retag (careful):\n` +
      `      git push origin :refs/tags/${nextTag}\n\n` +
      `Current package.json version: ${current} → next ${bumpType}: ${next}\n`
  );
  process.exit(1);
}

function assertCleanWorkingTree() {
  const porcelain = git(['status', '--porcelain']);
  if (porcelain) {
    console.error(
      'Working tree is not clean (commit or stash before releasing).\n\n' +
        porcelain +
        '\n' +
        'To ship only some changes: stash what you are not releasing, commit what you are, then run again.\n' +
        'Example:\n' +
        '  git stash push -m "wip" -- src/ui.html src/ui.css src/code.ts\n' +
        '  git add scripts/your-script.js && git commit -m "..."\n' +
        '  npm run build:release -- patch\n' +
        '  git stash pop\n\n' +
        'See README → “Selective commits before a release”. The zip is not committed; CI builds it from the tag.\n'
    );
    process.exit(1);
  }
}

function main() {
  const { dryRun, push, bump } = parseArgs(process.argv.slice(2));

  if (!dryRun && !bump) {
    console.error(`Usage: npm run build:release -- <patch|minor|major>
       npm run build:release -- patch --dry-run
       npm run build:release -- patch --push

Options:
  --dry-run   Build and pack only (no version bump)
  --push      Also git-push branch + tag (default: no push — use Desktop or push when ready)`);
    process.exit(1);
  }

  if (!dryRun) {
    assertCleanWorkingTree();
    assertNextReleaseTagFree(bump);
  }

  console.log('\n→ Production build…\n');
  // Clean first: pack-plugin.js zips whatever is in dist/, stale files included.
  // This mirrors `npm run pack`, which we can't reuse here (it re-runs the build).
  run('npm run clean');

  // build:production runs `npm run validate` as a blocking step, so a script that does
  // not parse or has an unresolvable @import stops the release here — before the version
  // bump and tag. That ordering is the point: pushing a tag triggers release.yml, which
  // builds the downloadable asset from the tagged tree, so a tagged broken build ships.
  try {
    run('npm run build:production');

    console.log('\n→ Pack plugin zip…\n');
    run('node pack-plugin.js');
  } catch (e) {
    console.error(
      '\n❌ Build failed — nothing was committed, bumped or tagged.\n\n' +
        '   If validation is what failed, fix the reported scripts and run again.\n' +
        '   Run `npm run validate` on its own to see the errors without a full build.\n'
    );
    process.exit(e.status || 1);
  }

  if (dryRun) {
    console.log('\n✅ Dry run done (no version bump, no push). codefig-plugin.zip is ready to test.\n');
    return;
  }

  const fromVer = readPackageVersion();

  console.log(`\n→ Version ${fromVer} → ${computeNextVersion(fromVer, bump)} (npm version: bump, commit, tag)…\n`);
  // Bumps package.json + package-lock.json, commits both, and creates the annotated
  // v-prefixed tag. %s is npm's placeholder for the new version, so the commit and tag
  // message stays "chore: release <version>".
  try {
    run(`npm version ${bump} -m "chore: release %s"`);
  } catch (e) {
    console.error(
      '\n❌ `npm version` failed — check `git status` and `git tag -l` before retrying.\n' +
        '   It bumps, commits and tags in that order, so a failure part-way can leave the\n' +
        '   version bumped without a commit, or committed without a tag.\n'
    );
    process.exit(e.status || 1);
  }

  // Read back rather than trusting the arithmetic: npm owns the version now.
  const next = readPackageVersion();
  const tag = `v${next}`;

  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);

  if (!push) {
    console.log(`\n✅ Tagged ${tag} on ${branch}. Push was not run (add --push to do it here).
   \`git push\` only sends commits — nothing uncommitted leaves your machine.
   When you are ready: git push origin ${branch} && git push origin ${tag}
   Or use GitHub Desktop: push the branch, then push the tag if needed.\n`);
    return;
  }

  console.log(`\n→ git push origin ${branch} and ${tag}…\n`);
  try {
    run(`git push origin ${branch}`);
    run(`git push origin ${tag}`);
  } catch (e) {
    console.error(
      '\nPush failed. Your version bump and tag exist locally — fix auth/remote, then run:\n' +
        `  git push origin ${branch}\n` +
        `  git push origin ${tag}\n`
    );
    process.exit(e.status || 1);
  }

  console.log(
    `\n✅ Release ${tag} pushed. GitHub Actions will attach codefig-${tag}-plugin.zip to the release.\n` +
      `   https://github.com/marxcie/codefig/releases/tag/${tag}\n`
  );
}

main();
