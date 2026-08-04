/**
 * Creates codefig-plugin.zip from the contents of dist/ (manifest.json, code.js, ui.html at the
 * archive root) for local testing or sharing. Keep this in step with the zip step in
 * .github/workflows/release.yml — they are two paths producing the same artifact, and CI's is the
 * one users download.
 * Requires the `zip` CLI (macOS/Linux; Git Bash on Windows).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const outName = 'codefig-plugin.zip';

function main() {
  const dist = path.join(root, 'dist');
  if (!fs.existsSync(dist)) {
    console.error('Missing dist/. Run: npm run build:production');
    process.exit(1);
  }
  if (!fs.existsSync(path.join(dist, 'manifest.json'))) {
    console.error('Missing dist/manifest.json. Run: npm run build:production');
    process.exit(1);
  }
  const out = path.join(root, outName);
  try {
    if (fs.existsSync(out)) fs.unlinkSync(out);
  } catch (_) {
    /* ignore */
  }
  // Zip the *contents* of dist/, so the manifest sits at the archive root next to code.js and
  // ui.html — which is what its bare `main`/`ui` paths expect.
  const r = spawnSync('zip', ['-r', out, '.'], {
    cwd: dist,
    stdio: 'inherit',
  });
  if (r.error) {
    console.error(r.error.message);
    console.error('Install a `zip` command or use the zip from GitHub Releases.');
    process.exit(1);
  }
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log('✅ Wrote', out);
}

main();
