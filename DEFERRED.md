# Deferred work and known issues

Things found while working through `.plans/01`–`12` that were **deliberately not fixed at the
time**, with enough context to pick each one up cold. Nothing here is a mystery — each entry says
what is wrong, how it was found, why it was left, and what fixing it would involve.

Ordered by how much it would hurt to leave alone. Add to it whenever a plan turns something up
that you decide not to chase: the cost of a known issue is much lower than the cost of a
forgotten one.

---

## 1. `@import` inside a doc block is a live import

**What.** The resolver's `@import` regex is not line-anchored and does not know about comments,
so an `@import` written *inside* a `// @DOC_START … // @DOC_END` block executes as a real import.

`scripts/HELP/help-documentation.js` documents the import system with four examples. All four
run: three inject functions into every run of that script for no reason, and
`@import { myFunction } from "My Custom Script"` fails, which shows the user an
"Import failed" notification when they open the HELP script.

**How it was found.** Measuring dead imports during cleanup; the HELP script's "unused" imports
turned out to be documentation.

**Why it was left.** The fix belongs in `src/import-resolver.js`, the most safety-critical shared
file in the repo, and it was found at the end of a long session. It is also load-bearing in a
surprising way: `select-by-styles-variables.js` has a *commented* `// @import { traverseNodes }`
that works **only** because comments are not respected. Changing the rule without checking every
script would break that.

**Fix.** Make the resolver skip `@import` occurrences inside a `@DOC_START`/`@DOC_END` range, then
un-comment the `traverseNodes` import in `select-by-styles-variables.js` so it stops relying on
the loophole. `tests/import-resolver.test.js` is the place to pin both. Roughly an hour, mostly
in tests.

---

## 2. `validate` carries a hardcoded exemption for `help-documentation.js`

**What.** `validateImports()` in `validate-scripts.js` skips that one file outright:

```js
// Skip validation for help-documentation.js (contains example imports)
if (script.filename === 'help-documentation.js' || script.name.includes('help & documentation')) return;
```

So the validator is **not** broken — it has a targeted workaround that exists only because of
item 1. Without the exemption it would correctly reject
`@import { myFunction } from "My Custom Script"`, since no such script exists.

**Why it matters.** The exemption is the only reason a HELP script can document the import syntax
at all, and it silences *every* import check for that file, including real mistakes. It is also a
per-filename special case, so a second HELP script documenting imports would fail the build.

**Fix.** Fixing item 1 makes this exemption unnecessary — delete it in the same commit. That is
the tell that the two belong together, and the order matters: fix the resolver, then remove the
workaround, then confirm `validate` still passes with the file no longer exempt.

**Note for whoever picks this up.** Two of the four example imports in that file
(`getCollection`, `setVariableValue` from `@Variables`) do resolve to real functions, so only
`myFunction from "My Custom Script"` actually fails today. An earlier version of this document
claimed the validator had a general blind spot to bad imports. It does not — that was wrong, and
the exemption above is the whole story.

---

## 3. `matchPattern`'s `caseSensitive` option has never worked

**What.** In its default (wildcard) mode, `matchPattern(text, pattern, { caseSensitive: true })`
still matches case-insensitively: the flag only ever suppressed a pre-lowercasing step, while the
compiled regex kept its `i` flag.

**Why it was left.** It is legacy surface with no shipped caller — plan 10 moved every script to
`nameMatches({ matchCase: true })`, which works. Silently changing a legacy function's behaviour
would affect user scripts that may have adapted to it.

**Status.** Pinned as reality, not endorsed, in `tests/pattern-matching.test.js` with a comment
saying so. Decide at some point whether to fix it or delete the function.

---

## 4. The legacy half of `@Pattern Matching`

**What.** 13 functions are marked *unused-by-shipped* in the library header: `fuzzyMatch`,
`globMatch`, `globToRegex`, `calculateFuzzyScore`, `levenshteinDistance`, `expandWildcards`,
`filterByCollection`, `getCollections`, `getPatternStats`, `createPattern`, `splitPattern`,
`validatePattern`, `processWildcards`, `normalizePattern`.

**Why it was left.** Plan 10 said explicitly not to delete them in that change, and the reason
still holds: they are part of a shipped library's public surface, and a user script may import
any of them. Removing them is a breaking change that wants a major version and a release note.

**Fix.** Delete them in one commit at a major bump, or keep them and stop apologising in the
header. Worth deciding rather than drifting.

---

## 5. Two more copies of `matchPattern`

**What.** `@styles.js` and `@replacement-engine.js` each carry their own `matchPattern`, separate
from the one in `@Pattern Matching`. This is *structural*, not sloppiness: `@import` extraction
only follows functions declared in the same source script, so a library that calls a helper must
declare it locally or its consumers break.

**Why it matters.** It is the same "one semantic, three implementations" situation plan 10 spent
a day fixing, one level down. Nothing shipped depends on those copies agreeing today.

**Fix.** Either teach the resolver to follow cross-script dependencies (large, and it changes the
import contract), or have those libraries call `nameMatches` and require consumers to import it —
which is what the new `validateResolvedCalls` check would then enforce.

---

## 6. `release.js` can lose its build-then-bump dance

**What.** Its header used to explain that `npm version` was avoided because `build:production`
rewrote `manifest.json`, leaving the tree dirty. Plan 09 removed that constraint — builds no
longer touch tracked files — so the bump could now be a plain `npm version` flow.

**Why it was left.** Plan 09 said to land the manifest change first, confirm a `--dry-run`
release, and decide separately. A `TODO` in `release.js` records it.

**Fix.** Small. Worth doing before the next release rather than after.

---

## 7. `variable-inspector.js` declares a function in an unimportable form

**What.** `var collectAllNodes = function (nodes) { … }`. The resolver recognises `var`-assigned
functions as *names* but cannot extract them, so nothing can import it — and a spec that tried
would fail confusingly.

**Why it was left.** It works fine inside its own script; the trap only springs if someone tries
to import it. Two other scripts have the same shape.

**Fix.** One-line change to `function collectAllNodes(nodes) {`. Do it when next touching the
file. The same applies to any `var x = function` at the top level of a script.

---

## 8. `shouldExclude()` exists twice

`build-scripts.js` and `validate-scripts.js` each define it, and they have already diverged once
on purpose (the validator now takes `{ includeStaging: true }` so `_TESTS/` specs are still
parse-checked). Noted in CLAUDE.md. A shared module would be cleaner but the divergence is
intentional, so this is low priority.

---

## 9. Preview has no in-panel Apply button

**What.** Applying a previewed plan means unticking **Preview only** and running again. Plan 11
left open whether an in-panel Apply button is worth the plumbing.

**Why it was left.** The two-run model needs no new message type in `src/code.ts`, and the one
real objection — `$n` counters renumbering if the file changes between runs — is handled by
recording a signature of the plan and warning when it no longer matches. Plan 11's advice was to
start there and build the button only if it feels bad in use.

**Revisit if.** You find yourself running the same script four times in a row, or the drift
warning fires in ordinary use.

---

## 10. Golden snapshots for the in-Figma specs

Plan 12 deferred rather than rejected this: after a spec runs, serialise the scratch page tree
(`type`, `name`, layout, `boundVariables`) and diff against a committed file. Cheap now the
harness exists, but needs id/key normalisation to be stable — node ids and style keys are not
deterministic. Would catch regressions across the Design System Foundations scripts almost for
free.

Plan 12 also **rejected** two approaches, with reasoning worth not relitigating: recording a
`figma` API trace for replay in CI (deep-proxying a live object graph for a regression guard that
only covers unchanged call sequences), and driving Figma Desktop with Playwright over CDP (no
Linux build, so a self-hosted Mac, and it breaks on Figma updates).

---

## 11. `colors.js` has never been verified against a real file

Graduated rather than archived during plan 05's triage, but never run. Everything else under
`scripts/` has been exercised at least once. Now that `npm run figma:run -- colors` exists, this
is a five-minute job in a `codefig-test` file.

---

## Habits worth keeping

Not deferred work — patterns that repeatedly paid off, recorded so they survive.

- **Reload the plugin after every dev build.** It broke three runs in one day before builds
  started stamping a build id. The tooling now tells you, but the habit is cheaper.
- **`figma:run` executes a script's *source*, i.e. its default config** — not what is typed into
  the plugin UI. For a destructive script that is the dangerous input; it is how the
  unconfigured-rename data-loss bug was found. Drive destructive scripts from the UI, or pass
  config via `--code`.
- **Verify guards mechanically, not by reading.** "All five write sites are guarded" was checked
  with grep. Reading scattered call sites and concluding "yes, covered" is what produced the
  `roundToGrid` crash.
- **Measure before building a check.** The first version of the missing-dependency validator
  flagged 35 of 35 scripts — pure noise. Restricting it to names some script declares as a
  function got it to 0 false positives with no parser and no dependency.
- **Ask what an unconfigured run does.** A semantic that is correct in isolation (blank find
  replaces the whole name) was destructive combined with a default config.
