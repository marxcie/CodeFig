/**
 * Stamp `packageId` / `packageVisibility` onto script objects for plan 32.
 * Shared by `build-scripts.js` (embedded scripts-data) and `validate-scripts.js`
 * (`findAllScripts`), so the UI and the validator cannot disagree about membership.
 */
const path = require('path');
const { compilePackageManifest } = require('./build-package-manifest.js');
const { PACKAGES } = require('./packages-config.js');
const { findScript } = require('./src/import-resolver.js');

function normPath(p) {
  return String(p || '').replace(/\\/g, '/');
}

/** True when this script file lives under the package's script folder. */
function isUnderScriptFolder(script, scriptFolder) {
  const fp = normPath(script.filePath || script.path || '');
  const needle = '/' + scriptFolder.replace(/^\/+|\/+$/g, '') + '/';
  if (fp.indexOf(needle) !== -1) return true;
  // Embedded build paths are `scripts/EXAMPLE_SCRIPTS/...` without a leading slash before the folder.
  const alt = 'scripts/' + scriptFolder + '/';
  return fp.indexOf(alt) !== -1 || fp.endsWith('scripts/' + scriptFolder);
}

/**
 * Build-time embed objects often have `filename` + `code` but no display `name` yet
 * (names are assigned later in `code.ts`). `findScript` needs a name for `@Foundation`-style
 * library resolution, so bootstrap from the title comment or the `@`-filename.
 */
function ensureLookupName(script) {
  if (script.name) return;
  const fn = script.filename || '';
  const lines = String(script.code || '').split('\n').slice(0, 20);
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith('//')) continue;
    const comment = trimmed.replace(/^\/\/\s*/, '').trim();
    if (!comment || comment.startsWith('@DOC_') || comment.startsWith('@UI_CONFIG') ||
        comment.startsWith('@CONFIG') || comment.startsWith('#') ||
        comment.includes('===') || comment.includes('==')) {
      continue;
    }
    script.name = comment;
    return;
  }
  if (fn) script.name = path.basename(fn, path.extname(fn));
}

/**
 * @param {Array<object>} scripts - mutable list; each may gain `packageId` and `packageVisibility`.
 * @returns {{ manifests: object[], errors: string[] }}
 */
function stampPackageMembership(scripts) {
  const errors = [];
  const manifests = [];
  const list = scripts || [];
  list.forEach(ensureLookupName);

  PACKAGES.forEach((pkg) => {
    const packageScripts = list.filter((s) => isUnderScriptFolder(s, pkg.scriptFolder));
    const namedScripts = packageScripts.map((s) => ({
      name: s.name || path.basename(s.filename || s.filePath || s.path || 'script', '.js'),
    }));

    const compiled = compilePackageManifest(
      pkg.id,
      pkg.name,
      namedScripts,
      pkg.libraries || [],
      list,
      pkg.styleSheet || undefined
    );
    if (!compiled.ok) {
      compiled.errors.forEach((e) => errors.push(pkg.id + ': ' + e));
      return;
    }
    manifests.push(compiled.manifest);

    packageScripts.forEach((s) => {
      s.packageId = pkg.id;
      s.packageVisibility = 'public';
    });

    (pkg.libraries || []).forEach((libName) => {
      const resolved = findScript(list, libName);
      if (!resolved) {
        errors.push(pkg.id + ': library "' + libName + '" did not resolve when stamping');
        return;
      }
      resolved.packageId = pkg.id;
      resolved.packageVisibility = 'package';
    });
  });

  return { manifests: manifests, errors: errors };
}

module.exports = { stampPackageMembership, isUnderScriptFolder };
