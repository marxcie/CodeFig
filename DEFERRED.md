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

## 8. `colors.js` reads and previews; it does not write

Supersedes "has never been verified against a real file", which is no longer true — the panel was
driven against `color - neutral`, `color - moss` and `colors / other` in a real file, and reading,
recognition, the banner and both preview strips were verified there.

**What is left.** The generator. Run reports that nothing was written and why. Márton's gate:
*"Do not write to Figma until I have seen a dry run."* So the order is dry run → review → write,
and the write path carries three rules that have to hold before it ships: **never delete** (a
shrinking step list reports orphans and leaves them alone), **never rename** (a step leaving the
list is not permission to rename the variable that held it), and **never write to an alias**.

**One smaller gap found while building the panel**, cosmetic and in the shared config UI rather than
in Colors: **a reprinted row normalises how a number is spelled.** `0.010` comes back as `0.01`. The
value is identical and only the row being rewritten is affected, but someone who typed the trailing
zero deliberately sees it vanish. (The other one, no per-column `@placeholder`, is now built.)

**Still prototype-only**, drawn in `colors-target.html` and not in the panel:

- ***Anchors edited since seeding*** and its Re-apply seed action. Needs the panel to remember what
  the seed wrote, which is state the config does not hold today.
- **The read-only Lightness column in OKLCH.** The frame draws it and the brief is clear about what
  it is — *"Lightness never appears per mode. That is the whole design"* — a display of what the
  shared ladder gave that step. It is the one part of the panel that needs a mechanism the config UI
  does not have: a cell whose value is **derived** rather than held. Storing it would be the mistake
  the Apply flag already taught (derived, never stored), so the shape that fits is letting the
  `@PREVIEW:` function fill read-only cells the way it already fills preview slots — it runs on every
  edit and is the only place that knows the ladder. Worth doing deliberately, not in passing.
- **Surfacing recognition notes** — `hueUnreliable`, a declined group, a skipped non-opaque variable
  — where a user can see them. They are computed and carried in `answer.recognition`; only the
  summary line reaches the panel.

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


## The tone pass over the remaining 77 helper texts

**What.** The copy pass fixed what could be pointed at: 87 Title Case labels, 15 explanations naming a
variable instead of the field on screen, 6 that only repeated their label, 3 broken sentences, and 5
worked examples that did not work. The other 77 explanations are accurate and were left alone.

**How it was found.** Márton asked whether `content-designer/ux-writing-skill` would help. Measured
against it, the copy already passes its rules — median sentence 8 words, 85% under 14, 2% over 25 — so
the skill would have flagged 13 of 85 and none of the real faults. What is left is tone and rhythm, not
a rule anything can check.

**Why it was left.** It is taste, it is a large diff, and it wants reading rather than a sweep. The
house voice is in `CLAUDE.md` and `CHANGELOG.md`, not in a generic skill.

**What doing it involves.** Script by script, with a person reading each panel — not one pass over all
of `scripts/`.

---

## A `@rows` control has no ⓘ

**What.** Every other control shows its explanation on an ⓘ beside its label. A `@rows` control is a
section rather than a field — the renderer deliberately builds no label for it, because the heading
above it already names it — so there is nothing to hang the button from. If one ever carries a
`@helper:` or has a paragraph folded onto it, the text falls back to a native `title` on the wrapper:
slow, unstyled, and easy to miss.

**How it was found.** Building the ⓘ. Checked against every config block in `scripts/`: no `@rows`
field owns any explanation today — the paragraphs near one all attach to the heading above it, which
is the right owner anyway and is where a reader is looking.

**Why it was left.** The fix is a header row inside the `@rows` block to hold the button, which is new
layout for a case that does not exist yet. Inventing a place to put a button nothing needs is how a
control grows a part that is wrong the first time something does need it.

**What fixing it involves.** Either a titled header inside `.config-ui-rows`, or hanging the ⓘ off the
`# Heading` above and accepting that a `@rows` helper reads as the section's. Decide when a block
actually wants one.

---

## A queued run that ends in `displayResults` reports a timeout

**What.** `npm run figma:run -- --file <script>` on a script whose last act is `displayResults()`
waits the full 120s and reports *"Timed out without a result from the plugin"* — while the script has
in fact finished. Traced with a `console.log` after every step: the loop completes, the panel
renders (`readInfoPanel` shows its rows), `figma.notify` fires, and the job still never resolves.

**How it was found.** Verifying `selection-to-variables` end to end. It reproduces on the committed
version as well as the new one, so it is not a regression — and it masked a real bug for as long as
it has existed, because a script that threw inside `displayResults` and a script that finished
cleanly reported *the same timeout*. That bug (function-valued `grouping`, below) was found only by
running the panel call on its own.

**What fixing it involves.** Finding which of `finishCodefigRunProgress()` and
`window.codefigRunComplete()` the job runner is actually waiting on, and why calling both — in that
order, which is what `displayResults` does — satisfies neither. Until then a `--file` timeout is not
evidence of anything; read `figma-console.log` and `readInfoPanel` before believing it.

---

## `displayResults` cannot carry a `grouping` with functions in it

**What.** `@InfoPanel`'s documented `grouping.getGroupKey` / `getGroupTitle` callbacks cannot work.
The panel is reached by `postMessage`, so the whole call throws `Cannot unwrap function` before
anything is displayed — and the script dies there, silently, inside whatever swallows it.
`selection-to-variables` passed them and its Info panel had therefore never appeared; that call is
now grouping-free. Nothing else under `scripts/` passes functions —
`match-colors-to-collection-variables` uses the declarative `{ modes, default }` shape, which is the
one that works.

**What fixing it involves.** Deciding which of the two is the truth. Either delete the callbacks from
the JSDoc and from `groupResults` — the UI groups by `node` and `property` and nothing else, so a
caller-supplied key function has nowhere to be honoured — or serialize a grouping *mode name* and
teach `getGroupKeyByMode` the new modes. The first is a doc change and a dead-code removal; the
second is a feature. Until then the annotation to remember is that `grouping` must be plain data.

---

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

## ~~The import button appears a beat late~~ — CLOSED, the button is deleted

**Found:** walking the DSF flow (Aug 2026). On a file that had just been written to, the button
only appeared after switching to another script and back.

**Why it was left:** it is a refresh-timing question, not a correctness one — `configImportState`
derives the right answer, but nothing asks it again after a run writes a manifest. The fix is
choosing the moments to re-probe, which is UI work better done alongside the rest of the import
UX than wedged in next to a parser fix.

**Closed (Aug 2026) without being fixed.** The Foundations panel designs replace the button with
**auto-import**: when Collection and Group resolve to something, the config loads itself, and a
helper line under Group says whether it came from a recorded set, from recognising the existing
variables, or not at all. The button, its probe, its badge and `configImportState` are all deleted
in `18`'s second slice. **Done** — the markup, `probeFoundation`, `foundationProbe`,
`updateConfigLoadButtonVisibility`, `requestConfigLoad`, `applyLoadedConfig`, `configImportState`
and the `pressImport` / `readButtonState` bridge commands are gone.

Kept as a note because the shape of the bug is worth remembering: the state was correct and the
question was simply never asked again. Nothing about auto-import removes that risk — it moves it to
"when do Collection and Group count as resolved" — so `18` names the moments rather than caching an
answer.

---

## `applyFileConfig` and `hasFileFields` have no caller

**Found:** deleting the import button (Aug 2026). Both are the **per-field** `@fromFile:` spelling —
a form whose individual rows each name a path into the file's config. The button was their only
caller. Auto-import replaced it and fills a config *block* through `fillConfigBlock`, because all five
Design System Foundations scripts write object-literal blocks.

**Why they are kept:** the per-field spelling is not wrong, it is unused. Every panel Márton has
designed so far reads a whole block, and the moment one does not — a script with three loadable fields
and nothing else — this is the path, already written and tested (`tests/config-load.test.js`).

**The risk in keeping them:** an exported, tested function with no caller reads as live code, and the
next person to wire loading may reach for the wrong one. If a second block-shaped panel ships and this
is still unused, delete it along with the parser's per-field `@fromFile:` support rather than leaving
it to be found a third time. The block-level `@fromFile:` is a different thing and is very much in use
— `configPreviewDomain` and every Foundations script depend on it.

---

## A load is reverted to the shipped defaults, and the reverter is not yet named

**Found:** driving the Grid panel on Márton's real system (Aug 2026), while verifying group detection.

**What happens:** opening Grid detects the grid under `Layout`, sets Group, loads the five viewports in
the collection's order — the write trace confirms both steps, `group-detected` then
`auto-import:recognised+ordered`, with `source: recognised` and the ordering reporting `changed: true`.
Read the form a minute later and it is back to the *shipped defaults*: `group: "Grid"`, three lowercase
modes, `Extra columns: 0`.

**What is established:**

- The load itself is correct. Recognition, the fill, the ordering and the note were all verified in the
  same run.
- The revert is **not** in `writeConfigBlockText`, which is where every programmatic write goes and
  where the trace watches.
- Nothing re-selects the script after a run: `selectScriptDirectly` is reached from the initial open,
  a user click, a new script, help, and batch import — none of which fired.

**The remaining suspect** is `mergeConfigIntoMain`, which serialises the **form's** values over the
block whenever the Configuration UI tab is the active view. It does not go through
`writeConfigBlockText`, so it was invisible to the trace — that tracing is now in place and one read
after a reload should name it.

**Why it is the likely one, and why it is a class rather than an instance:** the rule "the form is
authoritative while you are looking at it" is right for something you typed and wrong for text written
behind the form's back. Two bugs today were exactly this — a fill undone a moment later, and a reorder
that read the pre-fill block. Both were fixed at the instance. If this is a third, the fix is a version
stamp: the block text carries a version, the form records the version it was rendered from, and a form
older than the text is re-projected rather than merged. That closes the class. **Not built on
speculation** — it waits for the trace.

---

## A ramp panel reads a manifest or nothing — recognition is wired for Grid only

**Found** on `Website / DS 3.0 Beta` (Aug 2026), from "the Spacing script doesn't read the spacing
tokens in this file". It does not, and the file is not unusual: `Responsive System` / `Spacing` holds ten
FLOAT tokens (`space-none … space-3xl`) across five modes, made by hand, and the only CodeFig key in the
whole file is `set:grid:Layout`. `foundationAutoImport` has two ways to answer for `spacing` — a recorded
manifest, or a recognition branch that exists for `grid` and `colors` alone — so it answers `none`, and
the panel keeps the script's defaults. Running Spacing once at that address fixes it *from then on*,
which is no help to anyone opening a file they did not generate.

**Not the modes.** Those were a separate bug and are fixed: `foundationCollectionModes` never needed a
manifest, and `alignModesToFile` now gives a block to a mode the file has and the config does not.

**What fixing it involves.** The reader already exists and already does the pattern matching:
`readRampGroup` in `@Linear Ramp` (prefix on the group, FLOAT only, skips aliases and nested groups) plus
`fitRampMode` and `recogniseScale`. Its only caller is `adoptRamp`, which **records as it fits**, and
auto-import must not write — so this is a `rampRecognise` that stops before the `writeManifest`, plus the
`answer.source = 'recognised'` branch in `foundationAutoImport`. Small.

**The part that is not small, and blocks the above from being useful on this file.** Fed those ten
tokens, `recogniseScale` returns **`explicit` in all five modes** — no metric, modular or fibonacci
model reproduces them, and there is no near-fit to suggest either. `@Scale Models` supports an
`explicit` model (`explicitSequence`, and `rampModeToSize` carries unknown per-mode keys through), so
the config format can hold it; the panel cannot. The `@rows` control offers
`modular | metric | fibonacci` and has no `values` column, so recognition alone would fill in the token
names and the mode list and then have nowhere to put the numbers. **Order matters here**: recognition
without an `explicit` control reads a real spacing set and reports a scale nobody chose.

**The hazard while both are open.** The panel now shows every mode the collection has, and the ones it
adds carry a *copy of a neighbouring mode's* settings. Running Spacing would write those over the file's
real ladder (200/120/80/48/… in Desktop-large). The note under Group says the values are a starting
point; that is a sentence, not a guard.

---

## Typography records no manifest, so its panel can never load from the file

**Found** building the Typography panel (Aug 2026). Its config block declares
`// @fromFile: domains.typography`, and the panel's auto-import therefore offers to fill itself from the
file — but nothing ever *writes* a typography manifest. Grid and Spacing both do (Spacing through
`runLinearRamp`, Grid in its own run), so their panels answer `recorded`; Typography answers `none`,
every time, in every file.

**What it looks like:** not a failure. The panel simply says nothing was found, which is
indistinguishable from a file that genuinely has no typography set. Someone who has run the script
twenty times still gets "nothing recorded".

**What fixing it involves:** a `typographyManifestSlice(config)` beside `rampManifestSlice`, and a
`writeManifest` call at the end of `createOrUpdateCollection`. The slice keys are already declared —
`createStyles`, `styleNaming`, `overviewPreviewText` and `fontFamily` are in `foundationSliceKeys`, and
`normaliseDomainSlice` passes per-mode payloads through untouched, so the new `scaleType`/`base`/
`lineHeightAtTop` fields need nothing added. **Recognition** — reading an existing typography set out of
the variables themselves, the way `gridRecognise` does — is the larger, separate piece, and the honest
order is manifest first: it is small, and it is what makes the panel's own claim true.

---

## Heading spacing is stated twice, because the two surfaces lay out differently

**How it was found:** collapsing the two heading ladders into one. The *sizes* now come from a single
rule both surfaces read. The *margins* could not: the Documentation tab is a block container, where a
heading's top margin collapses with the paragraph above it to `max(a, b)`, and a config form is a flex
column (`.config-ui-form--rows`), where margins do not collapse but add. So reaching the same 48px gap
takes `var(--section-gap)` in one place and `calc(var(--section-gap) - var(--space-md))` in the other,
and there is no single value that produces 48 in both.

**Why it was left:** the numbers agree on screen and both derive from `--section-gap`, so changing the
gap still changes both. It is one duplicated *arithmetic*, not a second design decision, and both rules
say so in a comment. `tests/ui-css-shared-classes.test.js` covers the part that actually drifted — a
heading **size** set for one surface only — and deliberately exempts spacing.

**What fixing it involves:** making the form's row spacing a single mechanism rather than two, i.e.
dropping `margin-bottom` from `.config-ui-form--rows .config-ui-row` in favour of `row-gap` on the
container, then restating every heading margin against that gap. That touches the spacing of every row
type in every config panel — dividers, line breaks, previews, chips — for a 12px arithmetic difference
nobody can see. Worth doing only alongside other work on the form's layout.

---

## One heading that is redundant rather than duplicated

**How it was found:** removing the duplicated `# Script name` lines. Variable-inspector's config block
opens with `# Configuration`, which is not the script's name — it names the tab it is already on. It was
left in place for that reason.

**Why it was left:** the ask was to remove *duplicated* content, and this is a judgement call about
wording rather than a duplication. It is that form's only heading, so removing it changes what the panel
looks like — worth Márton's eye rather than an inference.

**What fixing it involves:** deleting the one `// # Configuration` line. Nothing else; the document title
already names the script.

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
