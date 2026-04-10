/**
 * Creates codefig-plugin.zip (manifest.json + dist/) for local testing or sharing.
 * Requires the `zip` CLI (macOS/Linux; Git Bash on Windows).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const outName = 'codefig-plugin.zip';

function main() {
  const manifest = path.join(root, 'manifest.json');
  const dist = path.join(root, 'dist');
  if (!fs.existsSync(manifest)) {
    console.error('Missing manifest.json (expected at repo root).');
    process.exit(1);
  }
  if (!fs.existsSync(dist)) {
    console.error('Missing dist/. Run: npm run build:production');
    process.exit(1);
  }
  const out = path.join(root, outName);
  try {
    if (fs.existsSync(out)) fs.unlinkSync(out);
  } catch (_) {
    /* ignore */
  }
  const r = spawnSync('zip', ['-r', out, 'manifest.json', 'dist'], {
    cwd: root,
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
