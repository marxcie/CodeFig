# CodeFig roadmap and status

**One page that says where the project is.** Written for whoever picks it up next, in any tool.
Last consolidated 2026-09-01: **Release 2.0 — Foundations** in exit sequence on `dsf-foundations`
(JSON `@PANEL_START` generational update; Variables storage; foundation maintain; DSF panel UX).
Cornerstones landed. **Next after 2.0 tag:** Plan 37 cleanup pass (panel consistency for custom authors).

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
| `.plans/37-config-format-decision.md` | Script language / config UX: JSON `@PANEL_START`; drop Configuration code tab; panel consistency. **Next: cleanup.** | A format or UX decision changes. |
| `.plans/38-script-storage-variables.md` | Script storage: Variables + LocalStorage (both keep). Library edit UX deferred. | A storage decision changes. |
| `.plans/39-foundation-maintenance.md` | DSF metadata hygiene; config script gone. Copy/duplicate → new identity (§11 implemented); tied collisions still skipped. | A maintenance decision changes. |
| `DEFERRED.md` | Known problems nobody is fixing yet, with what fixing involves. | Something is found and left. |
| `CHANGELOG.md` | What changed, in behaviour terms, for a user deciding whether to upgrade. | Every landed change. |

**Working across tools:** the repo is the shared state. Anything decided in a chat that is not
written into one of the files above did not happen. Plans carry their own status; this page carries
the sequence. **Do not commit `.plans/`.**

## Standing rules, regardless of who or what is working

- **Nothing is committed unless Márton asks.**
- **Do not commit `.plans/` files.** They are gitignored and stay local.
- **Backward compatibility with saved user scripts is not negotiable.** Bodies live in Variables
  and/or LocalStorage (prefs); both stay. A change that alters behaviour for a script carrying none of
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

## Release: 2.0 Foundations (in exit sequence)

**Why 2.0.** Generational config UX: JSON `@PANEL_START` panel recipes, values-only `@CONFIG`,
Configuration code tab gone. Shipped with script storage in Variables + canvas paste-share,
foundation maintain + stamp identity, and DSF panels that stay empty until a collection is chosen.

**Ships (cornerstones 37 / 38 / 39 + wiring 29–32):**

| Pillar | What users get |
|---|---|
| Config format (37) | `@PANEL_START` on all shipped panels; form-only Configuration UI; Help teaches JSON recipes |
| Storage (38) | Variables + LocalStorage; settings; canvas paste-share; export/sync menus |
| Foundation maintain (39) | Boot repair; config script removed; copy = new stamp; Move keeps |
| DSF panels | Empty General until collection; group scan; modes fix; scoped preview CSS |

**Plan 37 in 2.0:** migration + tab removal + teaching surfaces — **not** the open-ended cleanup
(panel language consistency for custom authors). That is **2.0.x / post-tag** work.

**Exit gate (before `npm run build:release -- major` → 2.0.0):**

1. ✅ `npm run validate && npm test` green (1305 tests, overnight 2026-09-01)
2. ✅ `npm run build:production` pass
3. ✅ `npm run build:style-reference` regenerated
4. ⚠️ Figma click-verify — partial via `figma:ui`; see `artifacts/RELEASE-2.0-morning.md`. **Reload once** (disk one build ahead of open plugin).
5. Changelog `[2.0.0] - TBD` — set date on tag
6. Commit uncommitted DSF + test batch when ready

**Explicitly not in 2.0:** Plan 37 cleanup; Colors dry-run; ramp recognition; library edit UX banner.

---

## Current state

**Committed** through `94d2577` on `dsf-foundations` (Colors Mode 1 / Value load fix). Major
landings: `5322d2e` (panels + Variables storage + foundation maintain), `266b811` (canvas
paste-share + Copy or move / Replace variables).

**Product calls**

- **2026-08-28:** ramp **recognition** deferred — manifest load + recreate is enough.
- **2026-08-31:** **LocalStorage stays** as personal backup beside Variables (teams). Do not
  demote/remove it. **Library / remote edit UX** deferred until one model covers prebuilts, DSF,
  `@` libs, and remotes (`DEFERRED.md`). **Next work** is config UX cleanup + consistency (37),
  including copy/move respecting manifests as core behaviour. Colors dry-run / DSF polish sits
  with the deferred polish cluster, not first.

**Typography:** write path exists; if a panel fails to load, debug the read path.

---

## Cornerstone initiatives

| Initiative | Plan | Locked | Status / next |
|---|---|---|---|
| **Script language & config UX** | `.plans/37` | JSON `@PANEL_START`; drop Configuration code tab | **Migrations done; tab deleted; teaching surfaces retargeted 2026-08-31.** **Next:** consistent panel language/structure for custom-script authors. |
| **Script storage & sharing** | `.plans/38` | Variables + LocalStorage (both keep); settings; canvas paste-share | **Landed.** Library edit UX deferred (consistent model later). |
| **Foundation metadata maintenance** | `.plans/39` | Auto-repair clear cases on open; no UI noise; config script gone | **Part A+B landed.** **§11 implemented 2026-08-31:** copy/duplicate → restamp new objects; originals keep stamps; boot forks clear `ambiguous-set-groups`. Move keeps identity. Tied collisions still skipped. |

**Still open (do not invent silently):** observation out of config; choice vs readiness naming;
reachability SAT; 38 `@import` / id minting / `@lib/` paths; 39 boot await vs fire-and-forget.
Ambiguous-collision **product rule is implemented** for clear cases (copy = new identity; boot
fork). Tied collisions still skipped.

---

## Done

| # | What | Result |
|---|---|---|
| 25 (write) | Colors Run writes variables | Stamp bracket, alias/alpha skips, orphan report. |
| 28 | Read path performance | API calls per read `(M+1)×V` to ~2. |
| 36 | Read without fitting, fit on demand | Colors read: 2.4s → under 20ms. |
| 39 (cache) | Manifest cache and recovery | Renamed group recovers; duplicated collection carries sets. |
| 34 | DevTools harness | Layout / CSS / rebuild / profile helpers. |
| 31 | `@PANEL_START` panel spec | Format complete; Colors + all shipped configs migrated. |
| 37 (migrate) | All shipped configs → `@PANEL_START` | DSF (5) + utilities (24) + Help specimen. |
| 38 (core) | Variables + LocalStorage + canvas share | Flag on; prefs; folders; paste-share. |
| 39 A+B | Foundation maintain + remove config script | Boot maintain live (require shim); `config.js` gone. |
| — | Curve editor fundamentals | Drag, presets → Custom, zoom, middle anchor. |

## Next (priority)

1. **Polish cluster** — Colors live dry-run; DSF/utility polish; curve acceptance + probes;
   on-demand fit hang; fitter corners; other `DEFERRED.md` user-facing items.
2. **Click-verify DSF previews** — after reload, confirm library `@STYLE_START` paints form + side preview.

## Done recently

| What | Result |
|---|---|
| Plan 32 step 6 | Trimmed DSF imports (spacing/corner 37→13, colors 65→19, typography 40→35); sibling depth fix so Bezier trees survive package hops. |
| Housekeeping | Removed Copy simple variables JSON + color-scale-layout; empty multi-collection copy; Preview/Match case dropped from rename/replace. |
| Plans 29 / 30 / 32 (wiring) | In-rows `data-*`; style injector + `@STYLE_START`; DSF `packageId` stamped (libraries stay listed). |
| Plan 30 DSF CSS | Preview styles on the libraries that emit the markup (`@Color Ramp`, `@Linear Ramp`, `@Type Scale`, `@Foundation`); injector gathers import graph + script sheet. |
| DSF + utilities + libraries + Help Docs | Functional `#` titles (≤~160 chars), Overview structure, UI-only options tables. Rules in `.claude/skills/ux-copy/SKILL.md`. |

## Parked, with the reason

| Item | Why it is parked |
|---|---|
| **Library / remote / prebuilt edit UX** (banner, leave-with-edits) | **2026-08-31.** Need one consistent model for remotes, DSF, utilities, `@` libs — not a library-only strip. |
| **Demote / remove LocalStorage** | **Rejected 2026-08-31.** Keep as personal backup beside Variables. |
| **Ramp recognition** | **2026-08-28.** Manifest load + recreate is enough. |
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
- `Copy or move variables` treats unpublished as unused (wording / safety).
- Styles still found by name → rename duplicates / orphans bindings.
- Curve-editor probe instrumentation still live; P3 gamut toggle not started.
- Library / non-persistable edit UX (consistent model later).

**Superseded / do not re-open without evidence**

- Typography “records no manifest” — write path exists; investigate read if a file fails to load.
- Spacing recognition hazard — deferred with recognition.

**Everything else** is duplication, dead code, and dev-only tooling.

---

## Two facts about `Copy or move variables` (`merge-variable-collections.js`), recorded so nobody designs around them

- **A variable ID cannot be reused or assigned.** Figma mints them. Links are preserved by rebinding
  every consumer before deleting the original, not by keeping the id.
- **A published collection's consumers in other files cannot be rebound from this file.** Publish
  status is a poor proxy for "unused" but a good proxy for "there are consumers I can neither see
  nor fix".
