# Deferred work and known issues

Things found while working through `.plans/01`–`12` that were **deliberately not fixed at the
time**, with enough context to pick each one up cold. Nothing here is a mystery — each entry says
what is wrong, how it was found, why it was left, and what fixing it would involve.

Ordered by how much it would hurt to leave alone. Add to it whenever a plan turns something up
that you decide not to chase: the cost of a known issue is much lower than the cost of a
forgotten one.

---

## The darkness axis, if it is ever wanted back

`@invert` made a charted curve's y axis count down from the top of its range — lightness drawn as
darkness, which is how Márton's Figma frames plot a ramp. It shipped, and then the numbers on the chart
disagreed with the numbers in the boxes beside it, in the config and in the variable. He chose
correlation over the frame and asked for it deleted rather than left unused: vocabulary nobody uses is
worse than a revert, because every future script inherits it and someone eventually reaches for it to mean
something else.

**Added in `6a87d22`, removed in the commit that names this entry.** Both are in git with their tests and
their documentation, so bringing it back is a revert rather than a rewrite. Anything reviving it should
also answer the question that killed it: what do the anchor boxes show, given the config stores lightness.

## The preview flushed the config text on every frame of a drag — fixed

`scheduleConfigPreview` has a 120ms maximum wait so the colour strip redraws while a curve handle is being
dragged — without it a plain debounce was reset by every frame and the strip only caught up when the
pointer stopped.

The preview used to read the config block, and `currentConfigBlock()` flushes `_configSyncPending`, so a
drag rewrote the config editor roughly eight times a second: two CodeMirror `setValue` calls per rewrite,
on the panel with the largest config block in the plugin.

"Not chased because nothing has felt slow since" stopped being true: Márton dragging a Hue handle on
`color - lime` produced a Chrome console log of this exact silent-run cycle firing back to back, and the
handle did not visibly move — the main thread was busy running it, not idle waiting for a frame he could
see. Fixed the way this entry already named: `requestConfigPreview` now overlays `configUIInstance
.getValues()` onto `_lastParsedConfig` (the last text parse, cached only on that path — never from the
overlay itself, or one drag frame's overlay would become the base the next frame overlays onto and drift
from what the text actually says) whenever a live edit is pending, and never touches CodeMirror during a
drag at all. The real parse path — typing, a commit, anything not live — is unchanged.

**How it was found:** measured while fixing the strip not updating during a drag, rather than reported —
and reported for real, later, as "the handles don't move," from the cost this entry had already written
down and left unchased.

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

**Or they collapse once `.plans/32-packages.md` actually ships.** Both libraries are DSF-only and
both would be members of the same package (confirmed: a real manifest compiled against this repo's
current scripts puts both in `design-system-foundations`'s member list). Package-scoped extraction
means `@Math Helpers` calling into `@Scale Models` resolves without every consumer importing both
— the root cause this entry names goes away for DSF specifically, not just for this one pair. Not
done yet: the manifest compiler exists and is tested, but nothing wires a real `packageId` onto a
shipped script, so this is still exactly as true as written until that lands.

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

## 8. Colors write path is built; P3 and a few panel polish items remain

Supersedes "has never been verified against a real file" and the old "reads and previews; it does not
write" entry. The panel was driven against real collections, and **Run now writes** colour variables
(the strip is the preview; there is no separate Preview only gate), with the foundation stamp bracket,
alias/alpha skips, and orphan reporting.

**What is left.**
- **Live review of the dry-run plan** against `color - neutral`, `color - moss` and `colors / other`
  before treating the write path as ship-ready (plan 25's gate).
- **Never rename** when a step leaves the list is already how orphans work; confirm wording in results
  is clear enough when someone expects a tidy.
- Display P3 (below), and the cosmetic panel items that follow.

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

**Two more facts a proper treatment would have to sit on top of, not design around yet.**
A variable's id cannot be reused or assigned — Figma mints it once, at creation, and nothing after
that can hand a new variable an old one. So a merge that wants bindings to survive has to rebind
every consumer to the new variable before the source is deleted; keeping the id is not an option on
the table. Separately, a published collection can have consumers in other files, and nothing run
from this file can see or rebind them. That is exactly why publish status is a poor proxy for
"unused" — but it is a good proxy for "there are consumers I can neither see nor fix", which is the
question the refusal is actually answering today.


## 10. A duplicated collection has no manifest and no stamps to recover from

**Already fixed, and verified — recorded here so it isn't reinvented.** A renamed group already
recovers correctly: `findFoundationSet` derives where a set lives
from its per-variable stamps, and every writer (`@linear-ramp.js`, `grid.js`, `typography.js`)
already resolves a set's id through it before calling `writeManifest`, so a run after a rename
re-files the record rather than duplicating it. `foundationAutoImport` (the read path for
Grid/Spacing/Radius/Typography) already calls the same resolver, so a renamed group's panel loads
its recorded config today, live-verified against a real rename performed with CodeFig's own
`duplicate-variable-collection.js` and Figma's group-rename. This was already built; nothing here
needed reinventing.

**What.** `duplicate-variable-collection.js` copies modes, variable names, values-by-mode,
descriptions and scopes — and nothing else. It calls neither `setSharedPluginData` nor
`getSharedPluginData` at any level, so a duplicated collection carries no manifest and its
variables carry no stamps. `findFoundationSet` has nothing to derive from in that case: it isn't
wrong, there is genuinely no data left to recover. Confirmed live: duplicating a stamped, manifested
test collection and reading both `readStamp()` and the collection's `set:` keys on the copy returned
nothing.

**How it was found.** Asked directly, live in Figma: write a manifest and stamp a set, duplicate
the collection with CodeFig's own script, read both back on the copy.

**Why it was left.** The fix is in `duplicate-variable-collection.js` itself — copy
`getSharedPluginDataKeys`/`getSharedPluginData` on the collection, and each variable's stamp, the
same way it already copies values-by-mode. That is a change to a different script with its own
call sites and behaviour to preserve, not a fallback to add to the read path, so it is out of scope
here and left as its own task.

**A rejected idea, so it doesn't get proposed again as free.** A cheap alternative to asking the
variables is: if a collection has exactly one set recorded for a domain, assume any group name
asked of it is that set, renamed. Rejected — a panel asks this on every keystroke while someone
types a group name, and this would match a genuine typo as confidently as a real rename, showing a
stranger's settings under a name nobody chose. `findFoundationSet`'s stamp-derived match doesn't
have this failure: it verifies the tokens actually at that address carry the asked-for group,
which a typo does not. The cheap path taken instead (`findFoundationSetCached`, in `@foundation.js`)
tries the sync cache read first and falls through to the same stamp-verified resolver on a miss —
same correctness, cost paid only when the cache misses.


## 11. Figma's native group duplication copies a stamp, and now two groups claim one set

**Still open — leave alone (plan 39).** Boot maintenance (`src/foundation-maintain.js`) detects
this as `ambiguous-set-groups` and does **not** auto-pick a winner. Clear-case orphans (stamp with
no manifest, manifest with no stamps) are repaired; this collision is not.

**What.** `duplicate-variable-collection.js` (this repo's own script) is not the only way a token
group gets duplicated — Figma's own Variables panel can duplicate a selection of variables (a
"group", in the folder sense) natively, no plugin involved. Tested live: stamp a group's
variables, duplicate the group through Figma's own UI, and the copies carry the **exact same**
stamp as the originals — same `set` id, same `token`. Two groups (`probe-group` and
`probe-group 2` in the test) now both claim to be where set `mt7e5wif-ai2i4y7i` lives.

**Consequence.** `findFoundationSet`/`findFoundationSetCached` derive a set's live group from its
stamps (`deriveSetGroup`), on the assumption that a set's tokens live in exactly one place. With
two groups stamped identically, a read for either group's name would see the same set id at two
different addresses — not a crash, but the resolver has no principled way to say which group is
the "real" one. Whichever `deriveSetGroup` happens to match first wins; the copy's own group is
functionally indistinguishable from the original until something re-stamps it.

**How it was found.** Asked directly, live in Figma, per this task's own instruction: stamp a
group, duplicate it through Figma's native UI (not this repo's script), read both copies' stamps.

**Why it was left.** A real fix means either detecting the collision (two groups, one set id) and
reporting it in product UI rather than silently picking one, or re-stamping a duplicate the moment
it's created — and Figma gives a plugin no signal that a native duplicate just happened. Boot
scan detection exists now (log only); choosing a winner is still a product decision.

**Mode duplication has no equivalent leak.** A stamp is per-variable, keyed by token; there is no
per-mode stamp in this system for a native "Duplicate mode" to carry over. Tested alongside the
above (`Mode A` → `Mode A 2`, a real new `modeId`) and confirmed to raise nothing comparable — the
only thing that could go stale is a manifest's own recorded `modeIds`, which already tolerates a
collection gaining modes it doesn't know about (see `foundationCollectionModes` and the read
path's own mode-list handling).


## The tone pass over the remaining 77 helper texts

**What.** The copy pass fixed what could be pointed at: 87 Title Case labels, 15 explanations naming a
variable instead of the field on screen, 6 that only repeated their label, 3 broken sentences, and 5
worked examples that did not work. The other 77 explanations are accurate and were left alone.

**How it was found.** Márton asked whether `content-designer/ux-writing-skill` would help. Measured
against it, the copy already passes its rules — median sentence 8 words, 85% under 14, 2% over 25 — so
the skill would have flagged 13 of 85 and none of the real faults. What is left is tone and rhythm, not
a rule anything can check. `.claude/skills/ux-copy/SKILL.md` now encodes what the real faults were
(mechanism asides, em-dash asides, teaching the domain, naming the internal concept, restating the
label) — use it for the panel-by-panel read instead of re-deriving the checklist.

**Why it was left.** It is taste, it is a large diff, and it wants reading rather than a sweep. The
house voice is in `CLAUDE.md` and `CHANGELOG.md`, not in a generic skill.

**What doing it involves.** Script by script, with a person reading each panel — not one pass over all
of `scripts/`.

---

## A `@rows` control as a whole has no ⓘ

**What.** A `@rows` column and a part caption already get one: each carries its own `@helper:` and
the renderer builds a real ⓘ for it (`renderer.js` ~3503 for a column, ~3702 for a part). What has
none is the `@rows` control taken as a whole — the block above every column and part — because the
renderer deliberately builds no label for that level, only for the heading above it. If a `@rows`
block-level helper is ever written anyway, it falls back to a native `title` on the wrapper: slow,
unstyled, and easy to miss.

**How it was found.** Building the ⓘ. Checked against every config block in `scripts/`: no `@rows`
control uses a block-level explanation today — the paragraphs near one all attach to the heading
above it, which is the right owner anyway and is where a reader is looking. Column- and part-level
`@helper:` text is used elsewhere and renders correctly; it is only the block level that has nowhere
to go.

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

## The dev bridge's job and UI queues have no protection against a second consumer

**What.** `figma-console-server.js`'s `POST /jobs`/`GET /jobs/next` and `POST /ui`/`GET /ui/next`
are a single-consumer protocol by convention only — whichever caller polls `/next` first gets the
item, and nothing marks it as claimed against a second poll. A stray `curl`, a debugging script, or
an agent inspecting queue state by hand can dequeue a job meant for the real plugin, which then
never sees it and never posts a result — so the original requester's `await` hangs until its own
timeout, with no error anywhere saying why. Same surface as the entry above: a run that actually
finished (or, here, a run that was quietly rerouted) reports as a stall.

**How it was found.** Mid-session, investigating why a UI-command measurement had hung: a direct
`GET /ui/next` call, made only to inspect what was queued, dequeued the pending `readForm` command
itself. The measurement script's own `await` for that command's result then had nothing to ever
resolve it. Reproduced the failure by causing it, not by hitting it unprompted — but the mechanism
is general, not specific to that one measurement.

**Why it was left.** The queues are explicitly in-memory, dev-only, no-auth infrastructure
(`figma-console-server.js`'s own doc comment: "There is no auth, which is why nothing here may ever
be reachable from a production build"). A single local developer driving one CLI at a time was the
whole use case; a second concurrent consumer was never a scenario this was built to refuse, only
one that happened not to come up until an agent started reaching into the protocol's own inspection
endpoints rather than treating them as a black box.

**What fixing it involves.** Either mark a dequeued item as claimed-but-not-yet-consumed so a second
`/next` within some short window gets it back (a lease, with the CLI or plugin renewing it), or stop
exposing a bare `GET /next` at all and require the caller to prove it is the one true consumer (a
per-role token set once at bridge startup). Either is real design work on shared state a single
local user was never expected to race against themselves. Until then: never call `/jobs/next` or
`/ui/next` directly to "just look" — use `GET /jobs/:id` or `GET /ui/:id` instead, which read
without dequeuing.

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

## ~~Foundation config is scaffolding, and gets retired~~ — CLOSED, script removed

**Closed (2026-08-28).** The shipped `scripts/EXAMPLE_SCRIPTS/Design System Foundations/config.js`
script is deleted (plan 39). Portable helpers in `@foundation.js` remain for tests. A read-only
"what does this file's foundation contain" diagnostic is still a possible future tool; it was not
part of this removal.

**Was:** scaffolding for copy / park-on-canvas / adopt before generators wrote manifests.

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

**Deferred 2026-08-28 (product).** Recognition is nice to have, not required. Enough that scripts
load saved settings from a recorded manifest, or the user recreates the scale. Do not prioritise
this over `.plans/37`–`39`.

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
real ladder (200/120/80/48/… in Desktop-large). Nothing on screen says so: the auto-import note that used
to render under Group (whatever it said was never a guard, only a sentence) was removed at Márton's
request, so there is now no warning of any kind here, guard or otherwise.

---

## Typography records no manifest — SUPERSEDED

**Was true** when the Typography panel first shipped. **No longer true:** `typography.js` calls
`writeManifest` after a run (`recordTypographySet`). If a panel still fails to load a set, debug
the **read / auto-import** path — do not re-implement the write. Recognition of a hand-made set
with no manifest is deferred with the rest of recognition (2026-08-28 product call).

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

## Removing a curve's middle point cannot be undone

`bezierWithoutMiddle` collapses a three-anchor curve to two by keeping each end's tangent and scaling the
handle back up to the full width. That is the closest single cubic to what was on screen, and two handles
cannot hold what three anchors said, so the shape moves.

**How it was found:** writing the function. It is inherent rather than a bug — a cubic has four degrees of
freedom and the curve being discarded has ten.

**Why it was left:** the alternative is remembering the discarded middle so a re-add restores it, which is
state that exists only to remember what the user already did — and this codebase has paid for that three
times in the Colors build alone. The coordinates would then disagree with a curve someone had dragged in
between.

**What fixing it involves:** a real undo stack for the config form, which would serve every control rather
than this one. Nothing has asked for one yet.

---

## The curve editor is 320px tall, so a plain `@rows` table would be unusable

Every shipped script that uses `@curve` in a row shows one row at a time — Spacing, Corner radius and
Typography use `@tabs`, Colors uses `@blocks`. In a stacked table (`@rows` with neither flag) a 320px
control per row would make a three-mode table a thousand pixels tall.

**How it was found:** looking at the tabbed layout in a browser and asking what the other one would do.

**Why it was left:** no shipped script does it, so the fix would be styling a case nobody is in — and the
sensible fix (a collapsed thumbnail that expands on click) is a second rendering of the control, which is
the kind of thing that drifts from the first.

**What fixing it involves:** a `.config-ui-rows-cell:not(.config-ui-rows-cell--stacked) .config-ui-curve`
rule shrinking the canvas, or a disclosure. Decide which when a script actually needs it.

---

## The scale can be stored twice, and nothing reconciles the two

A foundation set is recorded on its collection as invisible plugin data (`setSharedPluginData`), and the
per-mode `ratio` and `curve` are already in it. Márton also wants it written as a **hidden STRING variable**
— one value per mode, excluded from publishing and with no scopes — so the scale is readable and copyable
from the variables panel without opening the plugin.

Two stores means they can disagree: a run writes both, but someone can edit the variable by hand, or paste
a different config into the block and run again from another file. The agreed answer is a panel modelled on
the *"Multiple configs detected"* mockup — both values side by side, per mode, with a radio to choose and an
Apply.

**How it was found:** designing the feature. It is not a bug that exists today, because the variable half is
not built.

**Why it was left:** Márton's call — *"not urgent, and a rare use case."* It also cannot be built before the
question of when the panel reads a saved set at all is settled, and that is the more common complaint.

**What fixing it involves:** the write half (a toggle below *Generate overview*, a STRING variable per mode
with `hiddenFromPublishing` and `scopes: []`), a comparison against the manifest slice, and the chooser
panel. The string format already exists — the curve field prints `1.5 cubic-bezier(0.333, 0.333, 0.667,
0.667)` and parses it back.

---

## The typography preview shows one font weight, and cannot switch

The specimen picks the **highest** weight in `fontWeights` and says so — *"Desktop · font weight 600"*.
A file with 400 and 600 can only be previewed at 600. Márton asked for the note to read
`Font weight: 400 600` with the weight you are *not* seeing clickable, switching the preview.

**How it was found:** using the panel. It is a readout limitation, not a fault — nothing is wrong, there is
just one view where there could be two.

**Why it was left:** Márton's call — *"a small nice to have, but not a must,"* and there were more pressing
things. Nothing depends on it.

**What fixing it involves**, having checked the plumbing rather than guessed — roughly 80 lines, a third of
them tests, and every pattern it needs already exists:

- `buildPreviewSnippet` already passes `activeModeName()` into the preview call; the weight becomes a
  fourth argument beside it.
- `configUIContainer` already carries a delegated `click` listener for `.grid-suggestion` cards, because a
  preview is replaced wholesale on every recompute and a listener on its contents would be thrown away.
  A `[data-preview-weight]` branch goes there.
- `typographyPreviewHtml` renders the note as buttons rather than a string, and takes the weight it is
  given instead of calling `typeScaleSpecimenWeight`.

The one new thing is a module-level "which weight is being previewed" — view state with no config
equivalent, like which mode tab is open. Make it **self-correcting**: if the remembered weight is no longer
in `fontWeights`, fall back to the default, so editing the weight list cannot leave it pointing at nothing.
That is the difference between view state and the kind of stored answer this codebase keeps regretting.

---

---

## OKLCH chroma as a fraction of the gamut ceiling — tried twice, rejected

**The idea, from colorizr.** Instead of interpolating absolute chroma between the anchors, carry the
*fraction of what sRGB holds* at each step's own lightness and hue, and convert back. HSL already works
this way — saturation is that fraction by definition — and switching HSL to carry it directly was a large
win, which is what made this look promising for OKLCH too.

**Measured before the anchor fix: a wash.** Level on error, but it removed clipping entirely (lime 10
clipped steps to 0). Left open on that basis.

**Measured again after: much worse.** Worst 8-bit channel across the seventeen real sets, absolute against
gamut-relative with the curve fitted in fraction space:

```
lime  11 → 96      grass  6 → 16      pine  3 → 13      moss 4 → 10
coral  8 → 24      sky    8 → 16      sage  4 →  8      neutrals unchanged
```

Worst of all: **11 against 96**. It still removes every clipped step, and that is not worth nine times the
error.

**Why it reversed.** The first measurement was taken while the anchor step was wrong, so absolute chroma
was carrying a large error of its own and there was little to lose. With the anchor searched and the chroma
curve fitted, absolute chroma is accurate to 0.006–0.011 — and the fraction model then *adds* error,
because the ceiling depends on hue and the hue at each step is itself interpolated.

**The lesson, more than the result.** An idea measured against a broken baseline measures the breakage.
Both runs are in `scratchpad/gamut.js`; re-run it if the surrounding model changes again, but do not
re-open it on the strength of the clipping figure alone.

---

## The colour tokens are not drawn on the curve editor

**What it would be.** A dot per token on the curve chart, filled with the colour it stands for, placed at
its real lightness — so the gap between a dot and the line *is* the recognition's fitting error — with the
seed step ringed, and a hover tooltip carrying the name, hex and lightness. Four treatments were built and
compared against the real fitting maths: `artifact/7436a54c-8d71-444e-8b6a-71d00cd40b82`.

**Where it got to.** Márton picked **Dots with a seed ring**, with one correction: *"the dots are too
large"*. The specimen draws them at radius 2.2 in the control's 100-unit viewBox — about a 14px dot at the
real 320px size — and eleven of those crowd the line. He has further ideas and wants to come back to it, so
it is parked rather than half-built.

**What building it surfaced, and what has to be settled first.** The curve's middle anchor now sits *on a
step* by construction — that is what the anchor means since the two curves were collapsed into one. So the
anchor and a step dot land on the same point and draw over each other. They should be one mark, not two:
the anchor should *become* that step's dot — colour fill, accent ring, slightly larger — which also makes
dragging it read correctly, since dragging the anchor is choosing which step carries the middle colour.
Deciding that is the first move whenever this is picked up, because it changes what the dots are rather
than just how big they are.

---

## The `@rows` spec should be JSON on its own lines, not a mini-language on one

**What.** A `@rows` control's columns are declared in the property's trailing `//` comment, in a
positional mini-language. Colors' is **2146 characters on one line**; the next worst (Typography) is 680,
and the other four sit between 511 and 545. Márton, reading it: *"I'm worried it's really hard to read, and
I feel the same structure can be stored in a JSON object, much more readable."*

**The finding that matters.** The spec is a *serialization of an object the parser already builds*.
`parseRowColumns` (`src/config-ui/parser.js:324-530`) produces exactly `{ key, label, labelSpelled, type,
options, showWhen, disabledWhen, disabledNote, helper, placeholder, columns }`, and `renderer.js` consumes
only those keys. So "store it as JSON" is not a new format — it is writing down the internal one and
deleting the codec: ~207 lines of parser plus ~58 lines of printer (`serialiseColumn`,
`parser.js:1188-1245`) exist purely to compress that object onto one line and expand it again.

**Where the unreadability comes from — the one-line constraint, not the syntax.** One line means six
punctuation classes carry meaning positionally at three depths: `:` type, `|` separator, `()` options, `{}`
*both* group and condition (told apart by position only), `[]` disabled-when, `=` label (first one wins),
`;` AND, `@word` modifiers. That forces a pile of extraction-order rules, each of which is a comment in the
parser today because each was a bug first: `@rows:` before `@helper:` or the helper eats the spec; a
group's braces before its `@helper:` or the helper swallows the closing brace and the column silently
degrades to a text field; `@placeholder="…"` before the condition and the label because it may contain `=`
or `{`; an option label is `value:Label` and never `value=Label`; a column helper cannot contain `|`,
stated rather than escaped; `labelSpelled` exists only so the printer does not drop `=Columns` from
`columns:number=Columns`; `\n` in a helper is a literal two-character escape. It also collides with JS —
`radio(modular|metric)` was read as a call to `radio()`, which is why `validate-scripts.js:355-360` strips
comments first.

**Two separable decisions.** The first carries most of the win.

1. **Move the spec off the value line onto its own comment lines.** This is what buys multi-line, and it
   buys something bigger: the form never edits the spec, so a spec on its own lines can be carried back
   **verbatim**. `serialize` reprints the property line whenever a value changes, which is the *only*
   reason a spec printer exists — off that line, the printer is deleted rather than rewritten, and every
   round-trip hazard above goes with it.
2. **Make the syntax JSON.** `// @rows: {` … `// }` above the property, holding
   `{ label, layout, columns: [ … ] }`. `looseJsonToJson` already accepts bare keys, single quotes,
   trailing commas and comments, so reading it needs no new machinery. Conditions become named keys
   (`showWhen: { family: ["sine","quad"] }`, multiple keys ANDed), options a `{value: label}` map, and
   `@tabs`/`@blocks` — today two booleans where both could be set — become one `layout` of
   `"table" | "tabs" | "blocks"`.

**Dispatch is unambiguous, so nothing is forced.** A spec whose first non-space character is `{` is JSON;
anything else is the current mini-language. Colors can move and the other four stay. If you would rather
have one format, migrating all six sites is mechanical and lets `parseRowColumns` and `serialiseColumn` be
deleted outright.

**Considered and not chosen: the schema leaves the block entirely.** `// @rows: colorsModeColumns` naming a
real JS object in the script. It is the honest split of audiences — values are user data that get pasted
between files, the spec is author data that never is — and it is the only form that can *share*
sub-objects, which matters because Colors' three anchor groups are byte-identical and are ~1400 of its 2146
characters. But `parse(block)` is called from ~12 places in `src/ui.html` plus tests plus
`build-style-reference.js`, all with block text only; threading a second source through is a wider
commitment than this problem currently justifies. Revisit if a second script grows Colors-sized repetition.

**What it would cost.** ~60 lines in the `parse()` comment branch, beside where `@fromFile`, `@preview` and
`@collectionModes` already live (`parser.js:670-760`): recognise the opener, brace-count across comment
lines, strip the `// ` prefixes, `JSON.parse(looseJsonToJson(...))`, normalise `options` → `[{value,label}]`
and `showWhen` → `[{field,values}]`, attach to the next field row, keep `raw` for verbatim re-emit.
**`renderer.js` does not change** — the normalised column object is identical to what is built today.
Colors' spec migrates, `scripts/HELP/help-documentation.js` gains a JSON specimen, and therefore
`artifacts/style-reference.html` regenerates with a coverage row in `tests/style-reference.test.js`.
`config-rows`, `config-rows-group`, `rows-conditional-columns`, `rows-radio-and-named-options` and
`config-tabs` stay as back-compat coverage and each wants a JSON twin asserting the same parsed object;
`tests/config-round-trip.test.js` is the load-bearing one, and the verbatim-carry claim is what it should
be made to prove.

**One gate worth adding while in there.** Nothing validates the spec today, so a mistyped brace silently
degrades a column to a text field. A malformed JSON spec should fail `npm run validate`.

**One caveat on the shape.** An `options` map relies on JS insertion order, which holds for string keys but
**not** for numeric-looking ones (`{2:"Two",1:"One"}` iterates 1 then 2). No shipped spec has numeric
option values; if the format should be safe by construction rather than by inventory, use
`[{ value, label }]` and accept the extra width.

**Formalized as `.plans/31-panel-spec-json.md`.** Same diagnosis (the config block serving two masters),
same dispatch shape (new reader if the new region is present, old parser otherwise, nothing deleted), same
differential-test discipline. The plan additionally names the region `@PANEL_START`/`@PANEL_END` rather than
an in-block `@rows:` marker, covers all six panels' specs (not just `@rows`), and gates key-parity between
the new region and `@CONFIG_START` in `validate-scripts.js`. Read the plan before implementing this entry —
it supersedes the sketch above rather than sitting beside it.

**Reader implemented 2026-08-23, differentially proven for Grid only.** The one-liner this entry
describes still exists for Colors and the other four panels — nothing shipped has moved to
`@PANEL_START` yet. See the plan's own Status note for exactly what landed and what a Colors
migration would still need (the `sections`/`fields` vs. flat `blocks` shape decision, the
`serialize()` round-trip, and wiring `src/ui.html`'s block extraction to find the new region).

---

## Styles are still found by name, and have the rename problem variables just stopped having

**What.** Variables now carry a stamp and a set id, so renaming a group moves a token set instead of
duplicating it. **Styles were not part of that change.** `createOrUpdateTextStyles` matches on
`style.name === styleName` (typography.js:827) and `createGridStyles` on `s.name === styleName`
(grid.js:323). So renaming a text style, or renaming the group its name is built from, still produces the
exact failure the variables were just cured of: the next run creates a second style beside the first and
orphans everything bound to the original.

**How it was found.** Writing the stamp passes for variables. Nothing surfaced it — the two paths simply
were not in scope, and no test covers a renamed style.

**Why it was left.** The three commits were already large, and styles are a different resolution path with
its own publish semantics: a published *style* cannot be silently renamed under a subscribing file the way
a variable can, so the "just rename it in place" answer wants thinking about rather than copying.

**Fix.** `stampToken`/`readStamp` take any `PluginDataMixin`, which includes every style type, so the
mechanism already works — `adoptRamp` stamps variables through the same call. The work is an
`alignStampedStyles`/`stampGeneratedStyles` pair shaped like the variable ones, called around the two
style-writing paths, plus a decision about what a run should do when the style it would rename is
published and consumed. Until then, renaming a text style or a grid style is still a duplicating
operation.

---

## The manifest's `modes` field means three different things depending on the domain

**What.** `writeManifest`'s `modes` array is written with a different convention per generator:
`@linear-ramp.js` records **viewport keys** (`mobile`), `typography.js` records **labels**
(`viewportLabel(k)` → `Mobile`), and `grid.js` records **whatever the user typed into `modes[].name`**,
which in the shipped default config is the placeholder `Value`. `reconcileFoundation` papers over the
first two with a `viewportKeyFromLabel` comparison on both sides.

**How it was found.** Adding `modeIds` — the helper had to accept keys *or* labels, which is the tell.

**Why it was left.** It predates this work and fixing it means changing what three generators write, which
is a migration of its own; and now that `modeIds` carries the identity, `modes` is decorative for
reconciliation purposes, so the inconsistency has stopped causing warnings. It is a readability problem
rather than a correctness one — until someone reads the field and believes it.

**Fix.** Pick one (viewport keys, since that is what a portable config uses between files), convert the
other two, and have `parseManifest` normalise anything older on the way in. Cheap once someone decides.

---

## Colors write brackets with the stamp passes

**What.** Done — `colors.js` `runColors` calls `findFoundationSet` → `alignStampedTokens` →
`processVariables` → `writeManifest` → `stampGeneratedTokens`, same order as `runLinearRamp`.

**Left here only as a pointer.** Do not "simplify" by stamping before the manifest: the manifest mints
the set id the stamps must carry.

---

## Nothing catches a cross-script function passed by reference

**What.** `@import` extraction follows *calls*. A function handed over as a value —
`findByStamp(candidates, domain, token, foundationStampData)` — is never called in the extracted text, so
it is never pulled in, and resolves to `undefined` inside the sandbox. `validateResolvedCalls` only
inspects calls too, so the script **validates clean and fails in Figma**.

**How it was found.** It happened: a named stamp getter passed to `findByStamp` took a full build, reload
and spec run to surface as `'foundationStampData' is not defined`. Fixed by inlining the callback, and the
rule is now in CLAUDE.md.

**Why it was left.** A first attempt at detecting it — flag any identifier that names a known top-level
function, is not declared locally, and never appears followed by `(` — produced 687 hits across the
scripts, essentially all noise: it collides with ordinary words that happen to be function names somewhere
(`set`, `run`, `at`, `one`, `op`, `walk`, `select`) and with identifiers in comments, strings and property
positions. Per the *"measure before building a check"* habit below, a check at that signal-to-noise ratio
is worse than none.

**Fix.** Needs real parsing rather than a regex: walk the resolved source, collect identifiers in
*argument position* that resolve to a known cross-script function name and are not themselves called
anywhere in the file. Worth doing only if this bites a second time — one occurrence, caught by the
existing spec suite in one cycle, does not yet justify a parser.

---

## A blocked rename and a split set are reported with no way to act on them

**What.** Two new warnings have no follow-through. `stamp-name-taken` fires when the variable a stamp
points at cannot be renamed to the configured name because something else already holds that name — both
are named and neither is touched, which is correct but leaves the user to sort it out in the variable
table. `set-split` fires when a set's tokens are spread across more than one group, and likewise only
describes it.

**Why it was left.** Both are genuinely ambiguous: which of two same-named variables the user meant, and
whether a split was deliberate, are questions only a person can answer. Guessing would be worse than
saying so — and per *"don't add config to fix user error"*, a setting is not the answer either.

**Fix.** If these turn out to be common, the panel is the right place: show the conflict with the two
variables named and let the user pick, rather than adding a resolution rule to the run. Wait for evidence
that anyone hits them first.

---

## The fitter places corners the data does not ask for

**Found by** measuring the tangent either side of the join on every ladder in
`benchmarks/colour-scales.json`. 27 of 28 fitted lightness ladders come back as *corners* — the two
inner handles are not collinear through the middle anchor — and on several the file itself is
smooth there. Coral is the clearest: across the fitted join its ΔL changes by 0.3 where a typical
step changes by 2.0, so the data is very nearly straight and the fit put a kink in it.

Nothing is visibly wrong, which is why it is here rather than fixed: the numbers are within the
accuracy limit and the ramp looks right. What it costs is *editing*. Márton's mirrored-drag
refinement — smooth stays smooth, a corner stays a corner — reads the node's kind off the
coordinates, so a spurious corner means dragging a handle does **not** bring its partner, on a
curve where it should. The behaviour is correct and the input to it is wrong.

**Fixing it** means the fitter preferring a smooth node when the data does not pay for a corner —
fit both, keep the corner only when it buys more than some margin. Measured cost of forcing
*every* join smooth, worst 8-bit channel from the file, via `npm run bench:colors`:

| | shipped (free fit) | forced smooth |
|---|---|---|
| HSL, worst of all sets | 10 | **15** |
| OKLCH, worst of all sets | 11 | **12** |
| mean of worsts, HSL / OKLCH | 5 / 5 | 7 / 6 |

So an unconditional constraint is affordable in OKLCH and **not** in HSL, where lime goes over the
14 limit in both its modes. Lime is the set that decides it either way — its file drops fourteen
lightness points between `350` and `400` where its neighbours drop one, which is a genuine corner
and the one the fit must keep. A per-join decision is therefore the shape of the fix, not a global
switch. Measured 19 Aug 2026; harness kept out of the repo, it is thirty lines around
`bezierWorstError` with the two inner handles parameterised as one angle and two lengths.

---

## `spacing.js`'s option table documents a config that no longer exists

**What.** `@DOC_START` in `scripts/EXAMPLE_SCRIPTS/Design System Foundations/spacing.js`
documents `modes: { name, min, max }`, `scaling.type`, `scaling.rangeMode`, `scaling.ease`,
`fontScaling` and `scaling.roundTo`. Its `@CONFIG_START` block holds `scaleType`, `base`,
`ratio`, `curve`, `step`, `mod`, `roundTo`, `extras`. None of the documented mode keys are in
it. `corner-radius.js` has the same drift, partly fenced off under a "The older shape still
runs" heading, which `spacing.js` lacks.

**Why it drifted.** The table is hand-restated prose with nothing tying it to the block. The
legacy keys are still accepted by the generator, so the table is not wrong, it is just
describing the legacy path as if it were the current one.

**Fix.** `.plans/31-panel-spec-json.md` adds a key-parity gate between the panel spec and the
values block. Extend it to generate the option table, or at minimum to fail when `@DOC_START`
names a key that is in neither. Until then, split `spacing.js`'s table the way `corner-radius.js`
does.

---

## The import blocks are hand-maintained dependency closures

**What.** `spacing.js` imports 37 names and calls 8. `corner-radius.js`: 37 and 8. `colors.js`:
49 and 5. Re-count against your working tree.

**Why.** `@import` is textual splicing and `extractFunctions` in `src/import-resolver.js` follows
calls only within one source file, so a consumer must re-declare everything its libraries
transitively reach. `validateResolvedCalls` keeps the list honest, which turns it into an
authoring tax rather than a safety net.

**Fix.** `.plans/32-packages.md`, step 4 — implemented and tested 2026-08-23
(`extractFunctions`'s `siblingLookup` parameter in `src/import-resolver.js`). Not wired to these
five scripts: nothing ships with a `packageId` yet, so today's import blocks are unaffected. Step 6
(actually trimming them) has its own explicit stop-gate in the plan and was not attempted.

---

## Nine of eighteen shared libraries have no non-DSF consumer

**What.** `@Foundation`, `@Linear Ramp`, `@Color Ramp`, `@OKLCH`, `@Type Scale`, `@Scale Models`,
`@Foundation overview`, `@Bezier`, `@Math Helpers` — nine of the eighteen files in
`scripts/CODEFIG_LIBRARIES/`, listed in CodeFig Libraries next to `@Core Library` as if a user
might import them standalone. (Verified by directory listing on `dsf-foundations`, 2026-08-23;
earlier notes said "9 of 19" and, separately, "eleven total" — both stale.)

**Why it was left.** There is no private-member concept. Every library is global because that is
the only thing the resolver knows how to be.

**Fix.** `.plans/32-packages.md`. `@Math Helpers` has no functional non-DSF caller (`grep -rl
"Math Helpers" scripts/` turns up only DSF scripts, DSF's own libraries, and one line in
`scripts/HELP/help-documentation.js` that just *lists* it in prose) — safe to mark
package-private, but update that documentation line so it stops naming a library users can no
longer import standalone.

**The manifest that would hide these nine compiles correctly, but nothing shows it to anyone
yet.** `build-package-manifest.js`'s `compilePackageManifest`, run against this repo's real
scripts, produces exactly this package's member list (verified 2026-08-23). What's missing:
`build-scripts.js` does not call it, so no script the plugin ships carries a `packageId`, and
`src/ui.html`'s CodeFig Libraries list has not been taught to hide `visibility: "package"`
members — these nine are still listed exactly as before.

---

## The panel DOM has no selectable identity — partly fixed, the dense part is not

**What.** `buildField()` in `src/config-ui/renderer.js` stamped `config-ui-field
config-ui-field--{type}` and nothing else. No key, no group, no section, no package. No
stylesheet could address a specific group of fields, so panel arrangement could not be changed at
all without editing the renderer.

**Fixed 2026-08-23, for plain fields.** `buildField()` now stamps `data-key`/`data-type`, and
`data-section` from the nearest heading above it (derived at render time in `buildRow()`, not
stored — see `.plans/29-field-identity.md`); `buildForm()`'s root carries an empty `data-package`.
Covers every plain `@UI_CONFIG` field and the outer wrapper of a whole `@rows` control.

**Still open: `buildRowsControl`, `buildRowGroup`, `buildRowCell`.** The builders for what is
*inside* an `@rows` table — a mode's individual cells, an anchor group like "bright" — were not
touched. This is the part that actually matters for Colors: its hue anchors, chroma anchors and
curve editors all live inside `@rows`, so `[data-section="hue"] [data-type="curve"]` — the plan's
own motivating example — does not work yet. Deferred rather than attempted in the same pass
because it happened while the plugin could not be reloaded to check the Colors panel still
renders correctly, and this builder family is the one `DEFERRED.md` already has several
silent-breakage entries about.

**The exact fix is spec'd, not implemented.** `.plans/34-devtools-harness.md`'s "B3, extended"
walked all 6 in-rows curve instances' real ancestor chains and names the precise two-line change
(`data-section` on `.config-ui-rows-tabpanel` at `renderer.js:3387-3388`, optionally `data-key`/
`data-type="curve"` on `.config-ui-curve` at `renderer.js:3774`), with a checked-in failing
assertion (`npm run devtools:assert-layout`) that will start passing once it lands.

---

## `@keyframes` and `:root` will collide once scripts can ship CSS — the rewriter is done, nothing calls it yet

**What.** Not a current bug — no script can ship CSS today. `.plans/30-scoped-stylesheets.md`
introduces the surface; this recorded the part that was easy to miss: two scripts defining
`@keyframes pulse`, or a script setting a custom property on `:root`, would escape any
prefix-based scoping that only rewrites plain selectors.

**Fixed, in the rewriter, 2026-08-23.** `src/style-scoper.js` namespaces `@keyframes` names by
owner id and rewrites `animation`/`animation-name` references to match, rewrites `:root` to the
owner's `[data-style-owner]` attribute, and strips stylesheet-level `@import`. 30 cases in
`tests/style-scoper.test.js`, including a hostile stylesheet and the CSS-only exfiltration shape
the amendment to this plan raised (`input[value^="x"] { background-image: url(...) }`).

**Still true: nothing calls this yet.** The rewriter is inlined into `dist/ui.html` as
`CodeFigStyleScoper` but unused — the injector that would insert `<style data-style-owner>` when a
script's panel opens was not built in the same pass (see `.plans/30-scoped-stylesheets.md`'s
Status note for why). So this entry stays open until that wiring lands and a script actually ships
CSS through it.

---

## The sequential `getVariableByIdAsync` loop is in seven places

**What.** `colorsRecognise` and `foundationCollectionModes` are fixed by `.plans/28-read-path-performance.md`,
but the same shape appears elsewhere in `@foundation.js`: lines 837, 1105, 1184, 1255, 1642 and
2051. Each is `for (i of ids) { var v = await figma.variables.getVariableByIdAsync(ids[i]); … }`,
one round trip per variable, in series.

**Why it is left.** Plan 28 fixes only the loops on the colours read path, because that is the
one with a measured user complaint attached, and each fix carries the risk of changing what a
read returns. Fixing all seven in one commit means seven golden tests or none.

**Fix.** Once plan 28 has proved the pattern (`getLocalVariablesAsync(type)` once, index by id,
pass the index down), work through the rest in order of how hot they are. Write the collection
overview and stamping paths last, since they run once per Run rather than once per keystroke.

---

## `foundationCollectionModes` stringifies the base value once per variable per mode

**What.** `@foundation.js:1111`:
`JSON.stringify(byMode[id]) === JSON.stringify(byMode[baseId])`, inside a loop over modes, inside
a loop over variables. `byMode[baseId]` is stringified M times per variable for the same answer.

**Why it is left.** Trivial next to the async cost in plan 28, and fixing it in the same commit
would muddy that change's before/after numbers.

**Fix.** Hoist the base stringify out of the inner loop. Two lines. Do it while plan 28 is open,
in a separate commit.

---

## Nobody knows how many times a read rebuilds the form

**What.** `requestAutoImport`'s own comments describe the cycle as "reset, fill, rebuild, reset,
fill, rebuild", and the `detectedFor` address-claiming guard exists specifically to stop a
collection selection running the whole thing twice. Whether it now runs exactly once has never
been measured.

**Why it matters.** If it is still above 1, every fix in plan 28 gets divided by a number nobody
has looked at, and the flicker Márton describes in the Colors config prose has the same cause.

**Fix.** A counter in the form-render entry point, logged at the end of a read, as part of plan
28's instrumentation (see `.plans/28-read-path-performance.md`). If it comes back above 1, it
gets its own plan.

---

## The on-demand fit hangs, not always, and not fully explained

**What.** Selecting *Estimated original* on a real collection (`color - lime`, 16 steps, group
`lime`) sometimes leaves the fit never landing — confirmed by waiting 85+ seconds against a
baseline (`colorsAnchorFits` measured at 549-719ms for this ramp size, `.plans/36`) two orders of
magnitude smaller. It is not always: one fit completed live, mid-investigation, with real 10-point
coordinates. It got worse, not better, across repeated attempts in the same session.

**Ruled out, each timed directly against `color - lime`:** `getLocalVariablesAsync`/
`getLocalVariableCollectionsAsync` (5-8ms for 269 variables, 15 collections — not a file-scale
problem), `oklchFromRgb`/`oklchHslFromHex` (0ms standalone on this collection's own RGB values —
not the colour maths), `colorsAnchorFits` (never reached under `skipFit: true`, so not implicated
in *that* path's hang), and a missing cross-file import (`oklchFromRgb` explicitly added
alongside `colorsRecognise` — still hangs, so incomplete imports are not the explanation either).

**Not ruled out, and not explained.** A bare `getVariableByIdAsync` call — the same one that
returned correctly earlier in the session — hung on repeat, which is consistent with the
already-known per-id loop (`colorsRecognise` falls back to it when no index is passed, matching
this file's own "seven places" entry above). But `colorsRecognise` called *with* a pre-built
index and `skipFit: true` — which by inspection has no remaining `await` at all on that path —
also hung, and nothing found by reading the source explains that one. Ruled out as an artefact of
the test harness itself: a trivial `console.log` job dispatched immediately afterward, at the same
job count, returned instantly.

**Why it is left.** Distinguishing "a bug in this codebase" from "this session's Figma process
has degraded after a very long day of testing" needs a clean state this investigation could not
produce — closing and reopening Figma itself, not just the plugin, then repeating the exact same
timed calls. That is the next diagnostic step, not a code change.

**The safety net, not the fix.** The curve control's own 6-second timeout (this pass) means a
stuck fit no longer freezes anything the user can see — but the estimate itself still does not
reliably arrive, and the feature is only as usable as that.

**Update, a later session, with a clean state this time.** Timed the same call directly —
`foundationColorsAutoImport('color - lime', 'lime', ['Lime-1'], 'hsl')`, properly imported this
time (`@Color Ramp` alongside `@Foundation`; a prior attempt's missing import was real but not the
cause) — three times via `figma:run --file`, right after a reload: **1159ms, 1156ms, 1185ms**,
matching the baseline above and not accumulating. So the fit itself is not the degradation.

Then the same request through the actual product path — a channel tab opened on a mode nothing
had touched, immediately post-reload: **never returned.** Repeated on a second, independently
fresh mode: **never returned.** Waited past 90 seconds on each, with and without concurrent
bridge polling (ruled that out specifically — a request left completely alone for 20s quiet
behaved identically to one polled every 1.5s). So: **identical code, dispatched two different
ways, one always finishes in ~1.2s and the other has now never once finished** across every retry
this session, immediately after every reload, with no exception thrown and no warm-up needed.

**What was ruled out this pass, each tested directly rather than assumed:**
- **A stuck shared mutex from an earlier failed request.** `runSilentSnippet`'s `silentRunInFlight`
  gates every on-demand fit, live preview refresh and auto-import — one lost answer parks it
  `true` forever, since it only clears on that answer's own `CONFIG_LOAD_RESULT`. Real, and worth
  fixing regardless (see below), but not sufficient on its own: a *second*, independently fresh
  row's request, given a full 20+ seconds after the first one for any such lock to have cleared,
  also never returned.
- **An uncaught rejection silently eaten.** The dispatched snippet is an unguarded
  `(async function () { await ...; codefigConfigLoadResult(...); })()` — it returns before its
  `await` settles, so a throw inside it never reaches the synchronous `try/catch` in `code.ts`.
  Wrapped it in its own `try`/`catch` reporting to `codefigConfigLoadResult({ error })`. Made no
  difference — the request still never answers, which means whatever is wrong is not a thrown
  exception; the promise genuinely never settles, one way or the other.
- **The CLI's own bridge polling starving the plugin's event loop.** Triggered a request, then
  touched nothing for 20 seconds. Same result as polling throughout.

**What was not ruled out, and is the shape of the remaining mystery:** the only remaining
structural difference between the working call and the hanging one is *how the `RUN` message was
sent* — `post('RUN', { code, silent: true })` directly from a live UI event (`onChannelOpen`/
`onRequestEstimate`) versus `post('RUN', { code })` from the job queue's `_codefigQueueStart`.
Reading `code.ts`'s `RUN` handler end to end, `silent` only gates `forwardToConsoleBridge` calls
and the notify/InfoPanel surface — nothing that should affect whether an `await` inside the
executed function ever resolves. Also unexplained: `requestAutoImport`'s snippet is the *same*
unguarded-async-IIFE shape, dispatched through the *same* `silent: true` path, and it works
reliably every time (confirmed live, repeatedly, with real recognised colours) — it just always
passes `skipFit: true`. So the working/hanging split lines up exactly with skipFit, not with
silent-vs-not and not with any theory above. Finding out why needs an unconditional (not
`!silentRun`-gated) checkpoint log inside `code.ts`'s `RUN` handler — a temporary, throwaway
change to see which specific `await` the promise is parked on — which needs a build-reload cycle
this pass did not spend on top of the three already spent confirming the shape of the mystery.

**Shipped anyway, because they are correct independent of root cause:**
- `SILENT_RUN_TIMEOUT_MS` (20s) in `runSilentSnippet` — a token-guarded watchdog that releases
  `silentRunInFlight` if nothing answers, so one lost request degrades to "this one estimate never
  arrives" instead of "nothing on this panel works again until reload."
- The `try`/`catch` above, and `_modeFitted`/`_quickFitInFlight` release on a caught error — so a
  fit that *does* throw fails a retry-able row instead of claiming it forever.
- Neither makes an on-demand fit actually land. **Say plainly: on a real collection, in this
  environment, across every attempt made this pass, it did not.**

**Parked, a later session still.** Four passes in, the mystery is unlocalised and the visible cost
is real: a control that asks and never answers reads as broken, worse than a control that does not
ask at all. *Estimated original* is no longer offered on a per-mode curve cell —
`ESTIMATE_REQUEST_PARKED` in `buildCurvePresetSelect` (`src/config-ui/renderer.js`) — while the
option that applies a fit *already in hand* (`estimated`, no request involved) is untouched, since
that path never goes near the hang. Un-parking is flipping that one flag back once the mystery
above is solved, not a rewrite: `requestQuickFit`, the tags, and the watchdog were left exactly as
built, and the tests that exercise them now drive `preset.value = 'estimated'` directly rather than
through a dropdown option, so they keep covering the mechanism with nothing left to click.

**The next step, so it does not have to be re-derived.** An unconditional (not `!silentRun`-gated)
checkpoint log inside `code.ts`'s `RUN` handler — one line before the function runs, one after each
`await` a quick-fit snippet makes, forwarded to the console bridge regardless of `silent` — run
once, live, on `color - lime`, to see which specific `await` the promise is parked on. That is a
temporary, throwaway change: add it, reload, trigger one on-demand fit, read `figma-console.log`,
then take it back out.

**Update, a later session again: the request was never the bug — landing unconditionally is.**
Parking the dropdown only closed the half of this a person could *ask* for. Opening a channel tab
still asked automatically (`onChannelOpen`), and confirmed live: a request made when a tab opened
landed successfully (not hung — this one specific answer was correct, empty for that channel) a
few seconds later, while a handle was already being dragged on a curve the person had since picked
a preset for. `applyQuickFit` writes its answer in unconditionally, with no way to know the row has
been touched since the request went out — so `applyMove`'s own read of the curve's stored value
came back `[]` on every subsequent drag frame, because the "answer" that landed was exactly that,
for that channel. Chrome DevTools console access (via a browser-automation MCP, once the right
frame context was found — the desktop app's plugin UI shows up as "Shim Plugin Iframe
(plugin-sandbox)" in the context dropdown, and there were two, one presumably stale) is what made
this traceable at all — `figma-console.log` cannot see a silent run by design. `onChannelOpen` is
now also a no-op. Same one-line reverts as before; `requestQuickFit` itself was never the problem.

**Update, a later session again: what looked like a dead handle was a dead swatch.** After the
`onChannelOpen` fix above, Márton reported dragging still did nothing — but the repro that followed
("moved the hue handles to blue and pink, the scale didn't change") turned out to be a completely
separate bug one level downstream: `colorsGenerateMode`'s Original substitution overwrote hue and
chroma along with lightness, so the swatch — the one place an edit would be visible — stayed pinned
to the file regardless of what Hue or Saturation said, for as long as Lightness stayed Original
(every freshly-read mode, since the fit above is still parked). Fixed, decoupled per channel; see
the `CHANGELOG.md` entry. Reproduced and verified live through the dev bridge (`setField`,
`dragControl` with `--allow-stale`) rather than waiting for a fresh reload, per Márton's own
instruction to keep working without one.

**Update, a later session again: a third bug, found the same way — drive it live, don't guess.**
Márton, after both fixes above: "well, it still doesn't work in Figma." Repeated the exact
`setField`/`dragControl` repro on a *fresh* build (not `--allow-stale` this time — the plugin had
reloaded) rather than assuming the two fixes already covered it. The swatch fix held: setting
`bright.hslHue`/`dark.hslHue` moved Lime-1's preview from lime to blue/magenta with Lightness still
on Original, no workaround needed. But `dragControl` on a fresh Hue handle left `hslHueCurve` at
`[]` — the drag never wrote anything, on the current build, not a stale one. Root cause, found by
reading `applyMove` and `draw()` side by side rather than by guessing from the symptom: `draw()`
positions every handle from `effectivePoints(stored)` — the *implied* Linear shape a field draws
when nothing is stored yet, which is the state of every untouched Hue, Saturation or Chroma field —
but `applyMove` read the *raw* stored value again, `[]`, and wrote `pts[dragging] = at.x` into an
empty array. A one- or two-number result is not a recognisable curve, so `bezierNormalise` discarded
it right back to `[]` on the very next read, every frame, settle included. Fixed by having
`applyMove` read `effectivePoints` the same way `draw()` does; see `CHANGELOG.md`. This is very
likely the actual, original "dragging a handle does nothing" report from the start of this whole
thread — the other two fixes were real, confirmed bugs in their own right, but neither explains a
handle failing to move on a field nobody has touched yet, which is exactly this. `dragControl`'s own
diagnostic fields (`curveValue`/`curveView` coming back `null`) turned out to be a red herring
either way — the dragged element is detached from the tree by the redraw `setPoints` triggers before
the diagnostic reads it back, `closest()` on a detached node finds nothing, and that has nothing to
do with whether the drag itself landed. Read `text` (the real config block), not those fields, when
checking a drag result through this command.

---

## ~~A middle anchor cannot be dragged below both ends, or above both~~ — CLOSED

Fixed in the two-segment axis pass: when `curveHasRealMiddle()`, the chart maps through
`valueAlongRamp` (bright → middle → dark, same shape as `oklchSegmentAt` / `oklchChannelAt`) instead
of `unitToValue`'s single span. Typing or dragging a Hue middle of 200° with ends near 100° moves the
handle there; generation and the chart agree. See `CHANGELOG.md` [Unreleased] Fixed.

## ~~The zoom and range controls stay visible, but do nothing, on a flat equal-ends curve~~ — CLOSED (honest horizontal)

Equal ends + no middle open on the full declared channel with a **horizontal** line at the pin
(generation ignores curve height when ends match). End grips use field values. Zoom/range stay.

## Add middle does not produce a mirrored / symmetric bezier — deferred, not urgent

**What.** After "Add middle point" on a 2-point curve, De Casteljau preserves the existing shape
(handles land where the subdivision puts them), not a mirrored pair like
`cubic-bezier(a,b,c,d) m,m cubic-bezier(1-c,1-d,1-a,1-b)`. Márton expected the latter; can live
with the former. Saturation already feels smooth because equal ends + De Casteljau stay near the
pin; Hue feels worse when overshoot + short-arc wrap interact with the split.

**What fixing it involves.** Optional post-split remirror of tangent handles (or a separate
"symmetric middle" action) without changing the evaluated path enough to surprise generation —
or accept De Casteljau as correct and document it.

## Hue short-arc through 0° still looks gappy on the chart — known

When Bright≈Dark≈100° and Middle≈290°, generation takes the short arc through 0° for each half.
A linear axis must either spike, gap (path break), or dip below 0 in continuous space — Pomax /
any cubic library does not remove that. Path break avoids the spike; the gap is honest.

---

## sRGB / Display P3 gamut toggle — required, not started

**What.** Colors today always fits into **sRGB by reducing chroma only**. Márton needs a mode switch
between sRGB and Display P3 — required product work, not optional polish. It changes the gamut clamp
when a colour is realized (`oklch → RGB`), and eventually which color space Figma variables are
written in. It does **not** change the curve editor's axis / middle model.

**Why it was left (for now).** Landed after the two-segment curve-axis fix on purpose: different
surface, easy to conflate with chart bugs, and `bench:colors` already gates sRGB matching. Do not
mark this optional or bury it under "nice to have."

**What fixing it involves.** A panel control (collection- or script-level) choosing the fit gamut;
`@oklch.js` (and the write path when it lands) honouring P3's larger chroma ceiling; regression via
`bench:colors` plus P3 fixtures; keep chroma-only fit (never move L/H). Gamut-*relative* chroma
curves stay rejected (DEFERRED above).

---

## A middle anchor cannot be dragged below both ends, or above both — SUPERSEDED

See CLOSED entry above. Kept momentarily so search hits still resolve; delete on the next DEFERRED
sweep if preferred.

**What.** Márton: a curve with an added middle point "has no sharp corners, but the middle still
acts weirdly" — investigated and fixed (`CHANGELOG.md`: the toggle was splitting at a flat 0.5
instead of the real middle step, a genuine discontinuity in generation). But a second, deeper
report survives that fix: "I can't make a curve like [a U-shape — bright and dark both near 100,
middle dipping to ~50]" on a channel whose two ends are equal or close. That one is not the split
bug. It is a real limit in the curve editor's own axis model, not yet touched.

**Why.** `unitToValue(a, u) = a.from + (a.to - a.from) * u` is how the renderer's whole axis — the
plotted line, the drag mechanics, the tick labels, the range strip — turns a curve's own 0..1
height into the channel's real value. It assumes the value at any point on the plot lies between
`bright` and `dark`, linearly. Generation does not share that assumption once a middle point
exists: `oklchRamp` treats `bright → middle` and `middle → dark` as two independent spans
(`oklchSegmentAt`, `@oklch.js`), each interpolated against the *field's* own value at each end,
with the curve consulted only for pacing within a span, never for the span's own endpoints. A real
dip — middle below both ends, or a peak above both — is completely expressible in that model. It
is not expressible in the renderer's, because `unitToValue` can only ever answer a number between
`bright` and `dark`. Dragging the middle handle calls exactly this function
(`applyMove`'s `dragging === 4` branch, `setEndValue("mid", unitToValue(a, pts[5]))`), so the
written value is clamped to `[min(bright,dark), max(bright,dark)]` by construction — the handle
cannot be pulled past either end, however far the pointer moves.

**Confirmed, not guessed:** read `applyMove`, `toView`/`fromView`, `axisView`'s window and
`rangeStops` — all six call sites share this one `unitToValue`, so this is not a bug in the drag
handler alone; the whole chart (line, ticks, range strip, drag) is built on an axis that has no
room for a value outside the two ends.

**What it would take.** The axis needs a real two-segment mode once a middle point (or a real,
independently-typed `middle.<channel>` value) exists — `unitToValue`/`valueToUnit`/`toView`/`fromView`
each becoming aware of a genuine third anchor, in the same shape `oklchSegmentAt` already answers
for generation, rather than a single linear span. That is a cross-cutting change to most of
`buildCurveControl`, not a targeted fix, and it has not been started. The split-position fix in
this pass is real and independent of it — it corrects where the corner *is*; this is about what
range the corner is *allowed to reach*.

**Still open as of this entry.** A later pass in the same investigation fixed a related-but-distinct
bug — a plain two-anchor curve with equal ends and *no* middle point drawing off-chart, or showing an
impossible value like "106.67% saturation" (`CHANGELOG.md`, `axisIsFlat`) — by drawing that one shape
in the curve's own `[0,1]` square instead of inventing a value scale for it. That fix does not touch
this entry: the moment a middle point exists (`curveHasRealMiddle()` true), `axisIsFlat` is false by
definition and the same `unitToValue` single-span limit described above still applies, unchanged. Do
not mark this entry resolved on the strength of the flat-axis fix — they read as the same complaint
("the curve won't do what I'm dragging it to") but are different code paths.

---

## Curve-editor probe instrumentation is live in shipped-adjacent code, on by default

**What.** `window.CODEFIG_PROBE = true` and `window.codefigProbe(tag, data)` in `src/ui.html`, plus
six call sites tagged `// PROBE:` (`curve:setPoints`, `curve:drag`, `curve:midInput`, `curve:axis` in
`src/config-ui/renderer.js`'s curve control; `preview:request`/`preview:result` in `src/ui.html`'s
preview path) — added during the curve-editor investigation this entry's neighbours document, to pull
exact axis/window/handle data out of a live session via `figma-console.log` instead of guessing from
screenshots. It is dev-bridge-gated (`_codefigBridgeFetch`, dev builds only, same guard
`tests/ui-dev-guard.test.js` checks) so it never reaches a production build, but it is **on by
default** in the current tree and posts a line to the console log on every curve redraw, drag frame,
and preview request — noisy, and easy to forget about once the investigation that needed it is done.

**What it would take.** Once the curve-editor work in this area is settled (the acceptance pass this
file's neighbouring entries still call for), flip `CODEFIG_PROBE` back to `false` or remove the call
sites entirely — they were reusable-by-design (`codefigProbe` is generic, not curve-specific) so a
future investigation can reintroduce the pattern cheaply rather than needing these exact six kept
around indefinitely. Left in place for now because the acceptance pass below is not done and the same
probe will very likely be read again before it is.

## ~~The zoom and range controls stay visible, but do nothing, on a flat equal-ends curve~~ — CLOSED

Equal ends keep zoom/range (synthetic window). See `CHANGELOG.md` [Unreleased].

## Acceptance pass on the curve editor: not started

**What.** Every fix logged in `CHANGELOG.md` under this investigation (axis/generation agreement,
drag-sensitivity flooring, the monotonicity reset, the flat-axis shape-space switch, the
middle-point-add value fix) was verified against the *specific reported curve* — real numbers pulled
from `figma-console.log`, replayed through a standalone Node harness, or pinned in a new test. None of
it has been checked as a **sweep**: every preset × every channel (Hue, hslHue, Saturation, Chroma,
Lightness) × every model (OKLCH, HSL) × both curve shapes (2-anchor, 3-anchor) × both directions
(equal ends, unequal ends), confirming the chart, the range strip, and the generated swatches all
agree with each other and with the numbers in the anchor boxes. Nothing has surfaced a new bug this
way — it just hasn't been done, and the density of related-but-distinct bugs found so far (five
separate, independently-confirmed issues in one investigation) makes it likely there is at least one
more waiting in a combination nobody has looked at directly yet.

**What it would take.** A pass through the live plugin (or `figma:run`/`figma:ui` driven from the
terminal) exercising each combination above once, comparing the chart's own drawn curve against
`colorsGenerateMode`'s real output for the same config — the same ground-truth method used for every
fix in this investigation, just applied systematically instead of per-report.

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
- **Verify a claimed file edit before reporting it, not after.** A plan-31 update was reported
  landed and hadn't — described in the same message that should have included it, never written.
  Re-reading the file after the edit is cheap; being wrong about your own last action in the same
  breath you reported it is the expensive version of the same mistake grep-checking guards exists
  to catch.
