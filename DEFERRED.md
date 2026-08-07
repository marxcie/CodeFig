# Deferred work and known issues

Things found while working through `.plans/01`–`12` that were **deliberately not fixed at the
time**, with enough context to pick each one up cold. Nothing here is a mystery — each entry says
what is wrong, how it was found, why it was left, and what fixing it would involve.

Ordered by how much it would hurt to leave alone. Add to it whenever a plan turns something up
that you decide not to chase: the cost of a known issue is much lower than the cost of a
forgotten one.

---

## 1. `matchPattern`'s `caseSensitive` option has never worked

**What.** In its default (wildcard) mode, `matchPattern(text, pattern, { caseSensitive: true })`
still matches case-insensitively: the flag only ever suppressed a pre-lowercasing step, while the
compiled regex kept its `i` flag.

**Why it was left.** It is legacy surface with no shipped caller — plan 10 moved every script to
`nameMatches({ matchCase: true })`, which works. Silently changing a legacy function's behaviour
would affect user scripts that may have adapted to it.

**Status.** Pinned as reality, not endorsed, in `tests/pattern-matching.test.js` with a comment
saying so. Decide at some point whether to fix it or delete the function.

---

## 2. The legacy half of `@Pattern Matching`

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

## 3. Two more copies of `matchPattern`

**What.** `@styles.js` and `@replacement-engine.js` each carry their own `matchPattern`, separate
from the one in `@Pattern Matching`. This is *structural*, not sloppiness: `@import` extraction
only follows functions declared in the same source script, so a library that calls a helper must
declare it locally or its consumers break.

**Why it matters.** It is the same "one semantic, three implementations" situation plan 10 spent
a day fixing, one level down. Nothing shipped depends on those copies agreeing today.

**Fix.** Either teach the resolver to follow cross-script dependencies (large, and it changes the
import contract), or have those libraries call `nameMatches` and require consumers to import it —
which is what the new `validateResolvedCalls` check would then enforce.

### 3b. Two copies of the modular ratio table

**What.** `@Scale Models` (plan 19b) carries `modularRatios()`, and `@Math Helpers` carries
`getModularScaleRatio` — the same eight numbers, because `generateScale` reads its own copy and
the `endpoints` model delegates to `generateScale` wholesale.

**Same root cause as item 3**: extraction follows calls only within one source script, so a
library that calls another library's helper works only if every consumer imports both. Grouped
here so the count of these is visible in one place rather than found one at a time.

**Current protection.** `tests/scale-models.test.js` asserts the two tables agree name by name, so
they cannot drift silently — only deliberately, and only with a failing test in the way.

**Trigger: they collapse in plan 20**, when typography becomes the second real caller of
`@Scale Models` and the companion-import change has to be made for it anyway. `@Scale Models` owns
the table, `@Math Helpers` reads it, and every consumer imports both. Doing it before then means
changing the import contract of every existing consumer to remove a duplication no one can
currently trip over.

---

## 4. `variable-inspector.js` declares a function in an unimportable form

**What.** `var collectAllNodes = function (nodes) { … }`. The resolver recognises `var`-assigned
functions as *names* but cannot extract them, so nothing can import it — and a spec that tried
would fail confusingly.

**Why it was left.** It works fine inside its own script; the trap only springs if someone tries
to import it. Two other scripts have the same shape.

**Fix.** One-line change to `function collectAllNodes(nodes) {`. Do it when next touching the
file. The same applies to any `var x = function` at the top level of a script.

---

## 5. `shouldExclude()` exists twice

`build-scripts.js` and `validate-scripts.js` each define it, and they have already diverged once
on purpose (the validator now takes `{ includeStaging: true }` so `_TESTS/` specs are still
parse-checked). Noted in CLAUDE.md. A shared module would be cleaner but the divergence is
intentional, so this is low priority.

---

## 6. Preview has no in-panel Apply button

**What.** Applying a previewed plan means unticking **Preview only** and running again. Plan 11
left open whether an in-panel Apply button is worth the plumbing.

**Why it was left.** The two-run model needs no new message type in `src/code.ts`, and the one
real objection — `$n` counters renumbering if the file changes between runs — is handled by
recording a signature of the plan and warning when it no longer matches. Plan 11's advice was to
start there and build the button only if it feels bad in use.

**Revisit if.** You find yourself running the same script four times in a row, or the drift
warning fires in ordinary use.

---

## 7. Golden snapshots for the in-Figma specs

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

## 8. `colors.js` has never been verified against a real file

Graduated rather than archived during plan 05's triage, but never run. Everything else under
`scripts/` has been exercised at least once. Now that `npm run figma:run -- colors` exists, this
is a five-minute job in a `codefig-test` file.

---

## 9. `merge-variable-collections` treats "unpublished" as "unused"

**What.** The script copies a source collection's variables into a destination, rebinds this
document, and then removes the source. Plan 19b's never-delete invariant added a guard: it now
refuses to remove a collection whose `getPublishStatusAsync()` is anything but `UNPUBLISHED`, and
tells you to delete it yourself once you know nothing depends on it.

That closes the worst hole — a published collection's variables carry keys that other files
subscribe to, and recreating them elsewhere leaves those files with missing variables they cannot
relink. But the refusal's wording still implies the converse, and the converse is not true:
**unpublished does not mean unused.** An unpublished collection's variables can be bound by nodes
in this file that the rebind pass missed, aliased by variables in *other* local collections, or
referenced from a component that lives here and is instanced elsewhere.

**How it was found.** Reading for the never-delete invariant in plan 19b, after the same class of
mistake turned up in `setupModes`' advice to delete a collection to fix mode order.

**Why it was left.** The guard is a strict improvement and it was cheap. Doing it properly is a
different job: the script's whole contract is "merge and remove", and making removal safe means
deciding what happens when it *cannot* safely remove — which is a UX question about a script
nobody has run against a real published library yet.

**What a proper treatment involves.**
- Count actual consumers before removing: variables aliasing the source's variables
  (`VARIABLE_ALIAS` values across every local collection), and bound nodes the rebind pass did not
  reach. Figma has no reverse index for either, so both are document walks.
- Make removal **opt-in** rather than the default — `removeSource: false` — so the safe path is the
  one you get by not thinking about it, and the destructive one is a sentence you had to write.
- Preview it, the way the find/replace scripts preview: "would remove *Old tokens* — 40 variables,
  0 aliases, 12 bound nodes rebound". Removal is the one operation in this repo with no undo worth
  relying on.
- Say the true thing in the refusal: *not published* is evidence, not proof.


## `perViewport` and `sets` are two spellings of one thing

**Found:** building parameter sets (plan 17, step 2). Adoption now writes both — `sets`, which a
person reads and pastes and which is the only one that can say `appliesTo: "*"`, and
`perViewport`, which every manifest written before this contains and which four specs assert on.
`toDomainConfig` states the precedence: sets win when both are present.

**Why it was left:** they are written from the same fits in the same breath, so they cannot drift,
and retiring the older one changes the v1 config format that 16b defined — a format change does
not belong inside a step about how a scale is described.

**The trigger:** when a manifest version bump is happening anyway, or when a second reader of the
v1 shape appears. Whichever comes first.

**What retiring it involves:**

- `rampAdoptionSlice` stops emitting `perViewport`; `normaliseDomainSlice` stops defaulting it.
- `toDomainConfig` reads `sets` only, and its precedence branch goes away with the second spelling.
- A manifest written by an older build still has `perViewport` and no `sets`, so the reader needs
  a translation — one set per viewport, the same shape `rampSetsFromConfig` already produces for a
  legacy `modes[]` — rather than a version check that treats old manifests as unreadable.
- Four specs assert `manifest.config.perViewport.desktop.*`; they move to `sets`.

---

## Foundation config is scaffolding, and gets retired

**Found:** walking through the whole DSF flow on one file (Aug 2026). The script exists because
16b needed a runnable round trip before any generator wrote a manifest. Generators write manifests
now, and once the portable config *is* the script's own `@CONFIG_START` block, `copy`, `to-canvas`,
`from-canvas` and `check` are all ways of doing something you can do by selecting the block and
pressing Cmd-C.

**The trigger:** both of these true — `adopt` has moved into the domain scripts, and the printed
config is the script's block rather than a rendering of an object.

**What moving `adopt` involves:** adopting a spacing scale is a spacing operation, and it pairs
with the import button — the button reads the manifest, `adopt` reads the tokens, both from the
script you are already in. So it becomes a mode of Spacing and Corner radius rather than a
destination you navigate to. Plan it with 18/19-era work; it should not be left stranded in a
script being retired.

**The one part that may deserve to survive:** a read-only *what does this file's foundation
contain* diagnostic — viewports, collections, sets, what has a manifest and what does not. That is
a different tool from a config mover, and the case for it does not depend on any of the above. If
it survives, it survives as that, with none of the four modes.

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
