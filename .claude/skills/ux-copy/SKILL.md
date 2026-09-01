---
name: ux-copy
description: How to write CodeFig's in-panel help text and Documentation tabs. Use whenever adding or editing a @helper:, @tooltip:, heading paragraph, status/result message, button label, @DOC_START block, or any string a user or script author reads in the plugin.
---

# In-panel and Documentation copy

## Who the reader is

Most copy is for a **designer using the Configuration UI**, not the person who wrote the script.
Assume they know Figma Variables and Modes. Do not assume they know CodeFig internals, `@import`,
or how a feature was built.

**Libraries** (`scripts/CODEFIG_LIBRARIES/`) are for **script authors**. Same clarity rules; API
names stay exact. Still lead with what the library does, not how it is implemented.

## The problem this exists to fix

This codebase's copy already passes generic UX-writing rules (short sentences, active voice).
**Do not run a length-and-reading-level checklist.** The fault is what the sentences are about:
they explain mechanism when the reader asked what to type or what the script does.

Bad (mechanism):

> How the hue travels between the ends. Worth least on a cool palette…

Better (actionable):

> Controls how the hue shifts from the light end to the dark end. Leave it as it is unless the
> palette is warm, where amber and orange need their own timing.

## Helpers (`@helper:`, folded paragraphs, tooltips)

Three lines at most, in this order. Stop as soon as the reader can act.

1. **Do.** What to put here, or what this changes. Verb or the thing itself — never "This field".
2. **Default.** What happens if they touch nothing, when that is not obvious.
3. **Deviate.** One condition under which the answer changes. The most common one only.

**ELI5 test:** Out loud: *"So what do I type?"* If that answer is not in the first sentence,
rewrite.

**Idea count, not word count:** three ideas max per bubble; two is better.

### Density faults (cut these)

1. **Mechanism asides** — why the system works that way ("which is…"). Docs can hold that; helpers cannot.
2. **Em dashes** — almost always smuggle fault 1. **Do not use em dashes in panel copy.** Second sentence or cut.
3. **Teaching the domain** — what Fibonacci/OKLCH is. Name the choice; Documentation teaches.
4. **Internal names** — config keys, library functions, `@Foundation overview`. Use the **on-screen label**.
5. **Restating the label** — if the only honest text repeats the caption, write nothing.
6. **Author workflow** — "to generate", "to read", "match in greyscale", personal build history.
   Say the outcome (shared lightness steps; match an existing HSL palette).
7. **Obsolete / removed options** — no strikethrough rows, no "this used to…". Current behaviour only.
8. **Cross-script references** in user copy — say what the control builds on the canvas, not which
   library builds it.

Shared controls across scripts (Scale, Step, Every N steps, Generate overview, Collection, …)
reuse **one wording** unless behaviour truly differs.

## Documentation (`@DOC_START` … `@DOC_END`)

### Structure

Docs keep a full markdown ladder: `#` / `##` / `###`.

1. **`#` Functional title (required).** What the script *does* — core capability — not a repeat of
   the script display name. ≈ **160 characters max** (count the heading text only, no `# `).
   Prefer **Creates…** / **Renames…** / **Rebinds…**. Lead with the outcome; put Collection /
   Variable Mode / binding detail in the same sentence when that is the core.
2. **`## Overview`** — expand what the user gets; how to use the main controls; optional overview
   frames. Separate ideas into short paragraphs or lists.
3. **`###` subsections** as needed (scale types, caveats, matching modes).
4. **`## Configuration options`** — **only controls that appear in the Configuration UI.**

### Configuration options table

| Control | Description |
| --- | --- |
| **On-screen label**<br>`configKey` | What it does for the user. |

- **Primary:** UI label (bold).
- **Secondary:** Source / config key in backticks under the label (`<br>`).
- Skip keys with no panel control (`fontScaling`, old `scaling.*`, removed options, internal
  helpers). Compatibility that still runs in code is not Documentation material unless someone
  asks for a Source authoring guide.
- No **Legacy configuration** section in user-facing Docs. Dead keys nowhere; live-but-hidden
  keys stay out of the options table.

### Library Documentation

Same structure and H1 length. Tables may list exported functions and parameters (authors need
identifiers). Still: outcome first, current API only, no removed APIs, no "see also" spam that
does not help the caller.

## Heading ladders (two surfaces)

| Surface | Tags | Notes |
| --- | --- | --- |
| **Documentation tab** | `h1`–`h3` from `#` / `##` / `###` | Full ladder. Functional `#` title ≤ ~160 chars. |
| **Configuration UI** | never `h1`; sections `h2`, nested `h3` | Form section titles must not wear the document-title size. Parser `level: 1` still means "section"; the renderer demotes the tag. |

Do not open Docs by restating the script list name. The editor header already shows it.

## Status and result messages

Not helpers. They sit where the user is looking. Order: what happened, then what to do about it.
Same density rules (no mechanism asides, no em dashes).

## Button and action labels

Verb + object, 2–4 words. `Save changes`, not `OK`. `Generate frames`, not `Run`.

## Where copy goes

- **Default:** behind the info button (`@helper:`, `@tooltip:`, folded paragraph — one bubble).
- **Exception:** status / result / progress.
- **`@rows` columns** may have their own `@helper:`. A helper on the whole rows control has no
  label and degrades to a native tooltip — prefer the section heading.
- **Documentation** takes everything the bubble cannot.

## Before you write

Read three nearby helpers (or one peer script's Docs) so voice matches.
House voice lives in this skill, `CHANGELOG.md`, and shipped DSF Docs after the 2026-09 copy pass.

Write the copy. Do not ask which wording is wanted. If *behaviour* is undecided, ask; do not
paper over it with prose.

## When editing existing copy

- One line per text: what changed and why (reviewable).
- Prefer panel-by-panel with a person when unsure; a full-repo pass is allowed when Márton asks
  for one (as in 2026-09).
- Update fixtures that snapshot panel helpers / Help specimen paragraphs in the same pass.
- After Docs H1 or Help specimen changes: `npm run build:style-reference` if Style & UI reference
  coverage is involved; `npm test` / `validate:soft` before calling it done.

## Quick checklist

- [ ] Helper: Do → Default → Deviate; no em dash; on-screen words
- [ ] Docs `#`: core capability, ≤ ~160 chars, not the script name
- [ ] Docs options: UI controls only; label primary, key secondary
- [ ] Nothing obsolete, legacy-only, or cross-script in user Docs
- [ ] Config form headings stay level-1 in PANEL data; renderer emits `h2`
