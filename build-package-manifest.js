const { findScript } = require('./src/import-resolver.js');

/**
 * Compiles a package folder plus an explicit library list into the runtime manifest shape
 * `.plans/32-packages.md` describes: `{ id, name, members }`. Build-time only — "the repo folder
 * becomes a build-time source that compiles into this shape, seeded on install."
 *
 * **Why the library list is explicit, not inferred from folder location.** A package's scripts
 * live in one folder (`scripts/EXAMPLE_SCRIPTS/Design System Foundations/`), but its shared
 * libraries live in a different one (`scripts/CODEFIG_LIBRARIES/`) — the current layout groups
 * files by *kind* (script vs. library), not by which package owns them. So membership cannot be
 * read off a directory listing the way `findAllScripts` derives a script's category; it has to be
 * told which library names belong to the package, the same way the "nine of eighteen" count in
 * `DEFERRED.md` was arrived at by checking each library's callers rather than its folder.
 *
 * Not wired into the actual build output yet — nothing in `dist/ui.html`'s embedded scripts data
 * carries a `packageId` today, so `src/import-resolver.js`'s package-scoped resolution (which is
 * itself implemented and tested) has nothing to key on in a real run. See the plan's Status note.
 */

/**
 * @param {string} id - the package's manifest id, e.g. "design-system-foundations".
 * @param {string} name - display name, e.g. "Design System Foundations".
 * @param {Array<{name: string}>} packageScripts - the scripts found in the package's own folder,
 *   each becoming a `{ kind: "script", visibility: "public" }` member.
 * @param {string[]} libraryNames - names of shared libraries this package owns privately, each
 *   becoming a `{ kind: "library", visibility: "package" }` member. Resolved against `allScripts`
 *   with the same fuzzy match `@import` itself uses (`findScript`) — not exact-string lookup — so
 *   this accepts the short name a script's own `@import` line would ("@Foundation"), not the
 *   category-prefixed display name `findAllScripts` reports ("CodeFig Libraries / @Foundation").
 *   Exact lookup was tried first and failed against the repo's own real data: every real library
 *   name is category-prefixed, so an exact match against the short names a person would actually
 *   type found nothing. A name that resolves to nothing at all is an error, not a silent member.
 * @param {Array<{name: string}>} allScripts - the full script list, to resolve libraryNames against.
 * @param {string} [styleSheetName] - the package's stylesheet file, if it has one
 *   (`.plans/30-scoped-stylesheets.md`). Omitted, no stylesheet member.
 * @returns {{ok: true, manifest: object}|{ok: false, errors: string[]}}
 */
function compilePackageManifest(id, name, packageScripts, libraryNames, allScripts, styleSheetName) {
  const errors = [];
  if (!id) errors.push('a package needs an id');
  if (!name) errors.push('a package needs a name');

  const members = [];

  (packageScripts || []).forEach((script) => {
    members.push({ kind: 'script', name: script.name, visibility: 'public' });
  });

  (libraryNames || []).forEach((libraryName) => {
    var resolved = findScript(allScripts || [], libraryName);
    if (!resolved) {
      errors.push(`library "${libraryName}" does not resolve against the script list — check the name`);
      return;
    }
    // The library's own full name, not the short name the config happened to spell it with — two
    // packages both pointing at "@Foundation" should record the one real script identically.
    members.push({ kind: 'library', name: resolved.name, visibility: 'package' });
  });

  if (styleSheetName) {
    members.push({ kind: 'stylesheet', name: styleSheetName });
  }

  if (errors.length) return { ok: false, errors: errors };
  return { ok: true, manifest: { id: id, name: name, members: members } };
}

module.exports = { compilePackageManifest };
