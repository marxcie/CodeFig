# CodeFig roadmap and status

**One page that says where the project is.** Written for whoever picks it up next, in any tool.
Last consolidated 2026-08-28 (late evening): Colors write committed; recognition deferred;
cornerstone plans **37 / 38 / 39** have go-ahead to execute. Do not commit `.plans/` files
(they stay gitignored / local).

Keep it current. If a plan's status changes, change it here too, in the same pass. A roadmap that
lies is worse than none.

---

## Where the documents live, and what each is for

| File | Holds | Update when |
|---|---|---|
| `ROADMAP.md` | This page. Status, sequence, what is parked and why. | Anything below changes. |
| `CLAUDE.md` | How the codebase works. Architecture, invariants, gotchas. | Behaviour or structure changes. |
| `.plans/NN-*.md` | One initiative each. Its own `**Status.**` block at the top is the source of truth for that item. **Local only — never commit.** | That initiative moves. |
| `.plans/00-INDEX.md` | The 01 to 27 history and their ordering constraints. | Rarely. Historical. |
| `.plans/37-config-format-decision.md` | Script language / config UX: JSON `@PANEL_START`; drop Configuration code tab; migrate remaining DSF panels. **Executing.** | A format or UX decision changes. |
| `.plans/38-script-storage-variables.md` | Script storage & sharing: STRING variables, local vs library, autosave policy. **Executing.** | A storage decision changes. |
| `.plans/39-foundation-maintenance.md` | DSF metadata hygiene: auto-repair on plugin open; Foundation config script removal. **Executing.** | A maintenance decision changes. |
| `DEFERRED.md` | Known problems nobody is fixing yet, with what fixing involves. | Something is found and left. |
| `CHANGELOG.md` | What changed, in behaviour terms, for a user deciding whether to upgrade. | Every landed change. |

**Working across tools:** the repo is the shared state. Anything decided in a chat that is not
written into one of the files above did not happen. Plans carry their own status; this page carries
the sequence. **Do not commit `.plans/`.**

## Standing rules, regardless of who or what is working

- **Nothing is committed unless Márton asks.**
- **Do not commit `.plans/` files.** They are gitignored and stay local.
- **Backward compatibility with saved user scripts is not negotiable.** Today they live in
  `clientStorage`; the planned model is STRING variables (`.plans/38`). Until migration ships,
  treat `clientStorage` as canonical. A change that alters behaviour for a script carrying none of
  the new regions is a stop-and-report, not something to design around.
- **A Figma number comes from inside Figma.** No Node substitute, no estimate presented as a
  measurement. If it cannot be measured, say so.
- **Click what you built.** In Figma, with a real collection loaded. Three separate bugs this month
  were hidden by verification layers that read fields instead of watching a panel behave.
- **The preview strip is the instrument for colour bugs.** Hex values, before and after.
- **Panel copy goes through `.claude/skills/ux-copy/SKILL.md`.** Behind the info button unless it is
  a status or result message.
- **`npm run build:production` disables the dev bridge.** `assertDevBuild` now refuses rather than
  hanging, but run `npm run build:dev` after.

---

## Current state

**Committed** through `c3f9db3` (Colors write path + OKLCH preview / curve chart fixes).

**This commit:** `ROADMAP.md` and `.cursor/rules/codefig-context.mdc` — shared orientation. No
`.plans/`, no scratchpad.

**Product call (2026-08-28):** ramp **recognition** (reading a hand-made scale with no manifest)
is deferred — nice to have. Enough that scripts load from a recorded manifest, or the user
recreates the scale. Do not prioritise Spacing/Grid recognition work.

**Typography:** the old deferred claim “records no manifest” is **stale** — `typography.js`
already calls `writeManifest` after a run. If a panel fails to load, debug the read path; do not
re-implement the write.

---

## Cornerstone initiatives (executing)

Go-ahead 2026-08-28. Order of value: **37 → 38 → 39** can overlap where independent; prefer not
migrating script bodies (38) until DSF panels sit on `@PANEL_START` (37) so storage does not
migrate twice.

| Initiative | Plan | Locked | Next concrete work |
|---|---|---|---|
| **Script language & config UX** | `.plans/37` | JSON `@PANEL_START`; drop Configuration code tab (hide → watch → delete); share via `@CONFIG` copy; HTML/JSX skin deferred | Migrate Spacing / Radius / Typography / Grid → soft `unsupported` audit → hide `configCode` tab |
| **Script storage & sharing** | `.plans/38` | STRING variables; Local vs Library UI; no consumer autosave for library scripts; explicit local copy only | Lock collection/chunk schema defaults; implement store + migrate from `clientStorage`; sidebar Local/Library |
| **Foundation metadata maintenance** | `.plans/39` | Auto-repair clear cases on every plugin open; no UI noise; remove Foundation config script | Remove `config.js`; `foundationMaintain` on boot; leave ambiguous stamp collisions alone |

**Still open inside those plans (do not invent silently):** observation out of config; choice vs
readiness naming; full reachability SAT; 38 chunking threshold / `@import` across library
inventory; 39 boot sync vs async and ambiguous native-duplicate collisions.

---

## Done

| # | What | Result |
|---|---|---|
| 25 (write) | Colors Run writes variables | Stamp bracket, alias/alpha skips, orphan report. Live dry-run review of plan still welcome, not blocking 37+. |
| 28 | Read path performance | API calls per read `(M+1)×V` to ~2. |
| 36 | Read without fitting, fit on demand | Colors read: 2.4s → under 20ms. |
| 39 (cache) | Manifest cache and recovery | Renamed group recovers; duplicated collection carries sets. |
| 34 | DevTools harness | Layout / CSS / rebuild / profile helpers. |
| 31 | `@PANEL_START` panel spec | Format complete; **Colors migrated**. |
| — | Curve editor fundamentals | Drag, presets → Custom, zoom, middle anchor. |

## In flight

1. **`.plans/37`** — migrate remaining DSF panels; then soft audit; then hide Configuration code tab.
2. **`.plans/38`** — STRING-variable script storage (implementation tasks being written as code lands).
3. **`.plans/39`** — boot maintenance + remove Foundation config script.

**Curve editor acceptance pass** — still in `DEFERRED.md`, hand-check on a real collection. Not
blocking cornerstone work.

## Next up (after / beside cornerstones)

Infrastructure that unblocks styling and DSF packaging, lower priority than 37–39:

1. Finish `.plans/29` into `buildRowsControl` / `buildRowGroup` / `buildRowCell`.
2. `.plans/30`'s injector, then move ~312 preview lines out of `ui.css`.
3. `.plans/32`'s wiring (`packageId` on DSF).

## Parked, with the reason

| Item | Why it is parked |
|---|---|
| **Ramp recognition** (Spacing / Grid / Colors from file without a manifest) | **Product deferral 2026-08-28.** Nice to have. Manifest load + recreate is enough. |
| **The estimate / on-demand fit** | Computation fine; live dispatch never arrives. Next: checkpoint log in RUN handler. |
| **`.plans/35` bezier solver cost** | Demoted — nobody waits on fit up front after 36. |
| **`.plans/33` custom components** | Held until a second person asks for a missing control. |
| **HTML / JSX panel authoring skin** | Deferred (not killed). JSON is the language. See `.plans/37`. |
| **A `when` container for repeated conditions** | Killed on numbers. |
| **Moving the fit into the iframe** | Only matters for a cost we stopped paying up front. |

---

## `DEFERRED.md`, triaged

**User-facing, still real**

- The fitter places corners the data does not ask for (mirrored handle dragging).
- `displayResults` grouping callbacks throw and kill the script silently.
- `merge-variable-collections` treats unpublished as unused.
- Styles still found by name → rename duplicates / orphans bindings.
- Curve-editor probe instrumentation still live; P3 gamut toggle not started.

**Superseded / do not re-open without evidence**

- Typography “records no manifest” — write path exists; investigate read if a file fails to load.
- Spacing recognition hazard — deferred with recognition; running without a manifest still uses
  panel defaults (user recreates). Do not treat recognition as a blocker.

**Everything else** is duplication, dead code, and dev-only tooling.

---

## Two facts about `merge-variable-collections`, recorded so nobody designs around them

- **A variable ID cannot be reused or assigned.** Figma mints them. Links are preserved by rebinding
  every consumer before deleting the original, not by keeping the id.
- **A published collection's consumers in other files cannot be rebound from this file.** Publish
  status is a poor proxy for "unused" but a good proxy for "there are consumers I can neither see
  nor fix".
