/**
 * How a config reaches a run without rewriting anything the user can see.
 *
 * Every Design System Foundations script declares its config behind the same guard:
 *
 *   var spacingConfigData = typeof spacingConfigData !== 'undefined' ? spacingConfigData : { … };
 *
 * which means a definition placed *ahead of* the source wins over the literal, with no change to
 * any script. `npm run figma:run -- <script> --from-file` and `--config` use that: the CLI builds
 * a short prelude, the plugin prepends it, and the script's own literal is simply unreachable.
 *
 * With no flag, no prelude is built and the source runs exactly as written — which is what keeps
 * a pasted config being the config that runs.
 *
 * Node-only (the CLI). The plugin does nothing here but concatenate two strings.
 */

/** A name we are willing to declare. It comes from a file on disk, but so does everything. */
function isSafeVarName(name) {
  return typeof name === 'string' && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

/**
 * The `var X = typeof X !== 'undefined' ? X : {` guard whose object holds the `@CONFIG_START`
 * block — not the wrapper each script builds around it. Overriding the wrapper would skip the
 * script's own compat and materialize steps entirely, which is a much subtler kind of wrong.
 */
function findConfigVarName(source) {
  const text = String(source || '');
  const guard = /var\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*typeof\s+\1\s*!==\s*['"]undefined['"]\s*\?\s*\1\s*:\s*\{/g;
  let match;
  let firstGuard = null;

  while ((match = guard.exec(text)) !== null) {
    if (!firstGuard) firstGuard = match[1];
    const rest = text.slice(match.index, guard.lastIndex + 4000);
    if (rest.indexOf('@CONFIG_START') !== -1 || rest.indexOf('@UI_CONFIG_START') !== -1) {
      return match[1];
    }
  }
  return firstGuard;
}

/**
 * The `@fromFile:` path declared on a script's config block, or null. Null means "this script
 * has not said where its config comes from", which is a reason to refuse rather than to guess.
 */
function findFromFilePath(source) {
  const match = /@fromFile:\s*([A-Za-z0-9_$.]+)/.exec(String(source || ''));
  return match ? match[1] : null;
}

/**
 * The lines to prepend. Empty string when there is nothing to override with — the caller then
 * runs the source untouched, byte for byte.
 */
function buildRunPrelude(configVarName, config) {
  if (!isSafeVarName(configVarName)) return '';
  if (config === null || config === undefined) return '';
  return [
    '// Supplied by npm run figma:run. The script\'s own config literal is unreachable below.',
    'var ' + configVarName + ' = ' + JSON.stringify(config) + ';',
    ''
  ].join('\n');
}

/**
 * May a named script — a shipped generator, which writes to the document — run against this
 * file? The same substring the in-Figma harness gates mutation on, so one rule covers both.
 */
function isTestFileName(fileName) {
  return String(fileName || '').toLowerCase().indexOf('codefig-test') !== -1;
}

module.exports = {
  buildRunPrelude, findConfigVarName, findFromFilePath, isSafeVarName, isTestFileName
};
