# Changelog

All notable changes to CodeFig. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semver](https://semver.org/).

## How to add an entry

Add it to **`## [Unreleased]`** as you land the change, not at release time — the reason for a
change is easiest to write down while you still remember it. `npm run build:release -- <bump>`
does **not** update this file; rename the `[Unreleased]` heading to the new version yourself in
the same commit.

Group under **Added / Changed / Fixed / Removed / Developer**. Write for someone deciding
whether an upgrade will disturb their file: say what changes in behaviour, not which functions
moved. Anything that changes what a script *does to a document* belongs under **Changed** with
a plain statement of the new default.

---

## [Unreleased]

### Added

- **Channel tabs in a `@rows` block.** `#>Hue` starts a tab where `#Hue` starts a section — the columns
  after it are shown only when that tab is open. Closed tabs are hidden rather than dropped, so every
  channel is still read; switching one is not an edit and does not touch the config.
- **The three anchor boxes sit under the chart**, left, centre and right. The two ends are the row's own
  cells, moved into place rather than rebuilt, so they keep their captions and their keys. The **Middle**
  box is the curve's middle handle read in the channel's units — type in it and the handle moves, drag the
  handle and it follows — and it is disabled with an em dash when the curve has no middle point, because
  then there is nothing for it to be a view of.
- **A curve can be drawn on a real axis.** `@ends: a..b` names the two fields a curve runs between and
  `@range: lo..hi` the limits of the quantity, and together they turn the plot's y axis from a unit
  square into the thing being edited — labelled at round values, with the dashed guide joining the two
  ends rather than the corners of the box. The ends become **square** handles you can drag, and dragging
  one types into its own field, drawn **filled** where a shape handle is hollow. Two columns sit beside the
  plot: a **zoom** — a triangle you drag, with step buttons above and below — and a bar showing the
  collection's own token colours across the window, which takes no input. Zoom in between two steps and
  the bar is the blend between those two, because it is a picture of that ramp rather than of the channel. Neither moves when you drag the curve;
  drag the empty chart vertically to follow a ramp that runs off the top or bottom. The ramp is clipped to
  the plot, grips to the plot plus their radius so one on the boundary sits *on* the frame, and a drag
  stops at the window's edge instead of pushing the curve out of sight. Curves without `@ends` — the scale
  editors in Spacing, Radius and Typography — are unchanged.
- **Colors' Mode settings are three channel tabs over one chart** — Hue, Saturation and Lightness — with
  Seed color above them, because a seed belongs to the mode rather than to a channel. Each tab holds that
  channel's curve and its two ends, and every curve is now on a real axis: hue in degrees, chroma 0 to 0.4,
  saturation and lightness as percentages. The five stacked curve editors are gone.
- **Colors' lightness curves are drawn on that axis.** The OKLCH collection ladder reads against its
  Bright and Dark, and each HSL mode's curve against its own — so the chart says what lightness a step
  lands on rather than how far the shape sits from straight, and the ends are draggable. Chroma, hue
  and saturation are unchanged for now: each of those still keeps a separate Middle field, and an axis
  would put a second answer to that question on screen beside the first.

### Changed

- **Reading a colour collection is about a third faster.** Selecting a collection and typing a group took
  2.9 seconds for a two-mode collection and 3.7 for a three-mode one, almost all of it arithmetic rather
  than reading the file — a second read of the same collection was no quicker. The anchor search already
  fits every curve it needs and the caller was fitting the same six again; it hands them back now. Measured
  in Figma: **2.9s to 2.1s** and **3.7s to 2.6s**, with every read landing on identical numbers.

### Fixed

- **Colors: an OKLCH collection's lightness ladder is now averaged across its modes** instead of
  taken from whichever one was read first. The ladder is shared — that is what makes the modes match
  in greyscale — so one mode used to get a ladder fitted to itself and the rest got someone else's.
  On a two-mode lime that was worth thirteen 8-bit levels of accuracy for the mode that lost the
  toss (21 from the file against 11); both now read 15. Collections whose modes already agree pay at
  most one level.

The find/replace scripts were the focus: they now agree on what a pattern means, and they show
you what they will do before they do it. The Design System Foundations scripts also stopped
deleting variable modes they did not recognise.

### Added

- **Change case** — recursively renames frame and group layers, component variant labels and values,
  and optionally instance names, in lower case, title case, or camelCase.
- **Selection to variables takes a group.** A **Group within collection** field says once where the
  variables go inside the collection, instead of every layer having to repeat it in its own name.
  It is a prefix, so it composes with the slashes already in a layer name rather than replacing
  them: group `bark` over a layer called `900` and no group over a layer called `bark/900` both
  write `bark/900`, and group `primitives` over `bark/900` writes `primitives/bark/900`. Left empty,
  nothing changes about how the script behaved before.
- **A bezier curve editor, for curves you draw rather than curves you pick from a list.** Two anchors and
  two handles: drag them, nudge them a percent at a time with the arrow keys (ten with shift), choose a
  starting point from the preset list, or paste `cubic-bezier(0.37, 0, 0.63, 1)` into the field underneath.
  **Add middle point** turns it into a three-anchor, two-segment curve so the top half can bend differently
  from the bottom — the split is exact, so adding the point does not move the curve. The coordinates *are*
  the setting: there is no family name stored beside them, so the preview can never show one curve while a
  run generates another, and the dropdown reads *Custom* the moment a curve stops matching a preset.


- **A Colors panel that reads a colour set and shows you where it stands — it does not write yet.**
  Three lightness anchors and a curve make a **ladder shared by every mode in the script**, so two modes
  land on the same tone with different hue and chroma; that is what makes them match under a greyscale
  filter. Each mode block carries its own seed, its own hue and chroma per anchor, and **its own palette
  strip**. In HSL the curve stays per mode, because an HSL curve legitimately belongs to a hue.
  - **Point it at a collection and group and the panel fills itself** from the variables: the steps from
    their names, and hue, chroma and the three anchors from the real first, middle and last values. It
    does **not** guess a curve — an existing ramp is a list of colours with no record of how it was made
    — so it draws what is in the file *underneath* what it would generate, each changed step's old hex
    struck through beside the new one.
  - **"OKLCH scale not applied" is a question, not a stored flag.** It is re-asked on every edit by
    comparing the file's values against the config's own output, so it cannot go stale, and the banner
    and the strips are driven from one comparison rather than two — they cannot disagree about how many
    steps would change.
  - **Lock seed re-anchors, it does not offset.** The middle anchor becomes the seed's own lightness and
    the ladder is recomputed through it; bright and dark are untouched, so the endpoints still match the
    shared ladder exactly. Interior steps drift, and the largest deviation is reported beside the field,
    because that number is the whole decision.
  - What it will not read: **an aliased variable is read through and never written** — an alias is a
    deliberate indirection and replacing it with a raw value breaks a link silently. A **non-opaque
    variable is reported and skipped**, never composited over an assumed background to invent a
    lightness. A group where **more than half** the variables are non-opaque is an alpha ramp, not a
    lightness ramp, and is declined in one line rather than itemised skip by skip.
  - **Run writes nothing.** It says so, and says why: the write path is gated on its dry run being
    reviewed first. A Run that half-wrote a colour set would be worse than one that refuses, because
    what it would be half-writing is a collection other files subscribe to.
- **HSL modes are per mode again.** A mode block in HSL now carries its own **Saturation** and
  **Lightness** beside Hue, and Chroma appears only in OKLCH. This was not cosmetic: HSL has no shared
  ladder, so a mode's own three lightness values *are* its ladder, and with nowhere to put them every
  HSL mode fell back to the same 98/46/4 and generated an identical ramp whatever you typed. Reading a
  collection now fills whichever set the panel is on, from readings taken in that model — a hue in
  OKLCH is a perceptual angle and a hue in HSL is where the maximum channel sits, and putting one in
  the other's field is a plausible-looking wrong number in every cell.
- **A `@rows` column can carry `@placeholder="…"`**, the same annotation a field spells, so a cell can
  show a grey example. A numeric cell labelled *Chroma* gives a first-time reader nothing otherwise:
  `0.012` and `12` are both plausible guesses and only one of them is a colour.
- **A column's condition can name a form field**, not only another column in the same row. It still
  prefers the row — two modes on two tabs can be on different scale types at once — and falls back to
  the form, which is what lets a mode's fields depend on a setting that sits above the whole table.
- **A settings panel fills itself from a set CodeFig never made.** Point Grid at a collection and group
  holding a grid — one built years before this plugin, or by hand — and the settings load from the
  **variables themselves**, matched by name and structure: `columns`, `gap`, `padding`,
  `viewport-width` and the `col-1…N` series. No id, no record, nothing CodeFig had to have written
  first. A value the set does not carry is worked out from the ones it does, and the panel says which
  of the two happened. It then checks itself and tells you whether running would change any of your
  values — and names what could not come back rather than leaving it at a default that implies it was
  read: *Generate overview* is not a variable, and *Extra columns* is inferred from how many `col-*`
  variables there are.
- **Grid suggests margin and gap pairs that divide into whole numbers.** The Suggested whole number
  divisions section is live: it searches whole margins and gaps around what you have, keeps the pairs
  where every column comes out a whole number, and ranks them by how many of your modes they are clean
  for, then by how little they move your values, then towards round numbers — a 79px margin is
  arithmetically as good as 80 and nobody wants one. Your current pair is always the first card when it
  divides cleanly. **Clicking a card changes the mode you are looking at and no other**: the badges say
  where else the pair would work, they are not a promise to write it. Nothing is applied by looking —
  only by clicking. When nothing in range divides, it says so and says what it searched, and when there
  are more results than cards it says how many.
- **A Style & UI reference, inside Help & documentation.** Every control a script's settings form can
  render, live in that script's own Configuration UI tab, with the exact line that produces each one
  written underneath it — so a change can be asked for by pointing at the thing rather than describing
  it. Its Documentation tab holds the type scale, the spacing scale and the colours, and keeps the two
  heading ladders apart: the same `// # Title` is 20px in a Documentation tab and 16px as a form's
  section title, which is not obvious from either one alone.
- **A note under a field can mention an annotation.** `@helper:` text stopped at the next `@word`, so
  a note reading *"an object with no `@rows`"* was stored as *"an object with no"*. Notes now run to
  the end of the line, which means `@helper:` has to be the last annotation on it.
- **A panel fills itself from where it points.** When a collection and group name somewhere CodeFig
  has already generated, the settings load on their own and a line under Group says so — no button to
  find, and nothing to press. It never overwrites what you have typed: once you have edited anything,
  it stops filling and tells you a saved config is there instead.
- **Grid records what it generated**, the way Spacing and Corner radius already did. That is what
  lets the panel above fill itself, and what lets a config move between files. Plugin data only —
  no variable, name or binding is affected.
- **Pick a collection instead of typing its name.** The collection field is a list of the collections
  in your file, plus *Create a new one* for a name that is not there yet. It stays one setting — the
  name — because a collection whose name does not exist is created when you run, so there is nothing
  extra for a config to remember. Which of the two is about to happen is said before you run:
  *"Brand tokens" doesn't exist in this file — it will be created.* That also covers a config pasted
  from another file, where the collection genuinely may not be here.
- **Pick a mode the same way you pick a collection.** A settings form can now offer the modes of
  whichever collection it is pointed at, plus *New mode* and a name — created on Run, exactly as a
  new collection is. It follows the collection picker above it, so changing collection changes the
  modes on offer — and empties it, because a mode you picked in one collection is not a mode of the
  next one. Left empty, values go to the collection's default mode. A config that arrives naming a
  mode this file does not have says so before you run, rather than creating it quietly.
  **Selection to variables** uses it; any script can, with `// @mode: targetCollection` on a var line
  and `getOrCreateMode` from `@Variables`.
- **Design System Foundations scripts have a form.** Their settings were only ever editable as code,
  because the form could not read the shape those blocks are written in. It can now, so every one of
  them opens on Configuration UI, and the config block is still exactly the thing you paste. Settings
  a form cannot represent yet stay editable in Configuration code and say so.
- **See the scale before you commit to it.** Spacing and Corner radius draw their scale in the
  Configuration tab and redraw it as you type — tokens down, modes across, each value as a bar,
  with the gaps under each column, because `1, 4, 8, 12, 16, 24` reads as regular until you see
  `3, 4, 4, 4, 8`. Nothing is written while you look: the preview generates in memory and cannot
  reach your document. The same picture appears in the results panel after a run, as the record of
  what was made.

- **Adopt a file CodeFig has never touched.** Point **Foundation config** at a group of spacing or
  corner-radius tokens in `adopt` mode and it works out how the scale was built — a base and a
  growing step, a fixed ratio, or a straight ramp — and records it, so the import button and
  `figma:run --from-file` work on a file made years before this plugin. **Nothing you can see
  changes**: no value, no name, no binding, nothing deleted or recreated. Where the numbers do not
  fit a model exactly it records them as they are and tells you what the closest fit would have
  changed, so switching is your decision and you see the cost first. A published collection is
  reported and left alone until you confirm, because recording writes plugin data and that shows
  subscribers a library update.
- **Foundation config** — a new Design System Foundations script that moves a config between
  files. It reads the viewports and generated sets a file already has and hands you the config
  **in the shape your scripts already use**: paste it straight between `// @CONFIG_START` and
  `// @CONFIG_END` in Grid, Spacing, Corner radius or Typography. It can also park the config in
  a text layer on canvas and read it back, and `check` tells you what a pasted config would mean
  without writing anything. Older configs load too — `structure.*`, `spacingScaling`,
  `fontScaling`, `figmaStyles`, `roundUpperValuesTo` — and every translation is listed, so a
  paste never quietly means something else. It never generates variables: reading a config writes
  the viewport list and nothing more.

- **The mode chips do something.** They were a view; now they are the control. Click a chip's label to
  rename that mode — a **rename**, so its values and every binding to it survive. The dash removes one,
  and says what that costs before it happens: *"Removing mode Tablet at Run — 12 variables hold values
  there, and any binding to it is lost."* The `+` adds one, seeded from the mode beside it so its
  settings tab has real numbers to edit. Drag to reorder. **Nothing reaches your file until you press
  Run**, and removing a mode then adding one with the same name is how you replace it — the panel says
  *"Replacing…"* when that is what you have set up.
- **A config pasted from another file still never deletes a mode.** A mode this config has not heard of
  is left exactly where it is, values and all. The only thing that removes a mode is clicking its dash.
- **Name a series of tokens instead of typing it out.** `spacing-{1,10}` in the Tokens field is ten
  tokens, `spacing-1` through `spacing-10`, and it mixes with names you write yourself:
  `none, px, spacing-{1,10}`. `{10}` is short for `{1,10}`. Two details worth knowing because they are
  requested by writing them rather than by a setting: it counts **down** as readily as up, so
  `heading-{6,1}` names a heading ramp smallest-to-largest, and a written leading zero is a width, so
  `{01,10}` gives `spacing-01 … spacing-10` — which sorts the way it reads in Figma's variables list.
- **Corner radius has its panel**, and its preview draws the thing you are judging: a 200×120 box per
  token with the radius applied at its real size, the name beside it and the value past it. Same skeleton
  as the others — General, a tab per mode, Preview — with each mode carrying its own scale and its own
  rounding. `none` is no longer a special case in the maths: it is an extra value of `0` that fills the
  smallest token name.

  **A radius past 60 says so.** The corners of a 200×120 box meet there, so 60 and 600 draw the identical
  pill — and the shipped design's own largest token is 96. Without the note, two different numbers look
  like the same picture.

  **The numbers are unchanged** in all three modes: desktop still generates `0, 4, 8, 12, 16, 24`. Only the
  spelling moved.
- **Typography has its panel.** The same skeleton as Grid and Spacing — General, a tab per mode, then
  two sections of its own: an **Overview** table listing every step with its size, line height, ratio,
  tracking and the variable a run will write, and a **specimen** setting your own preview copy at the
  real sizes, largest last. Each mode carries its own scale (Modular, Metric or Fibonacci) and its own
  rounding, and **Base unit is the size of the first token**, so tokens read smallest to largest and
  nothing has to say where the base sits.

  **Line height and letter spacing take two numbers each** — the value at the smallest step and,
  optionally, the value at the largest. Both are in px, and what runs between them is the *relative*
  quantity: line height as a ratio, tracking as a share of the size. That is what makes absolute line
  height rise while its ratio falls, and tracking tighten as type grows, which is the interaction the
  type-scale tools chart and none of them computes. **Fill in only the first and nothing changes from
  before**: line height keeps the base ratio and tracking stays flat.

  Two smaller things came with it: font weights are a list where a number is a weight and a word is a
  Figma font style name (`400, Semi Bold`), and text styles have their own two fields — whether to create
  them, and their naming — instead of being edited as an object in the code tab.

  **Configs written before this keep working and generate exactly what they generated**, pinned by a
  test: per-mode `minFont`/`baseFont`/`maxFont` with a top-level curve and easing still run, they simply
  have no controls. The default block's token *names* are unchanged, so a run updates the variables you
  already have — but its numbers are new, because a per-mode ratio has no min, max or easing with which
  to reproduce a sine ramp from 8 to 200.
- **Scale type is a set of radio buttons, and every ratio says what it is.** *Modular scale / Metric
  scale / Fibonacci* are visible at once instead of hidden in a dropdown, and the Scaling method list
  reads *1.25 Major third*, *1.618 Golden ratio* rather than bare numbers. The dropdown is now as wide as
  its longest option instead of a fixed share of the row.

- **A config form explains itself in one place: the ⓘ beside a label.** Helper text under the control,
  the descriptive comment lines between fields, and a control's leftover comment prose were three kinds
  of grey text in one form — and the third had never appeared at all, because it set a browser tooltip
  whose only styling hook had no rule behind it. They are one thing now. Hover the ⓘ, or reach it with
  Tab and press Enter to pin the bubble open; nothing that used to be written down has been thrown away.
  - **What a script's config block looks like has not changed**, and neither has what it means. A
    paragraph is still a comment line and `@helper:` is still `@helper:` — the panel decides where to
    show them, and writes your block back exactly as you wrote it, comments and all.
  - **A paragraph belongs to the control it sits against**, above it or below it, whichever it is
    touching — a blank or bare `//` line is the separator that decides. All 68 in the shipped scripts
    were checked one by one; two blocks whose spacing disagreed with their intent were given the
    spacer that says what they mean.
  - **A block that is meant to be read says so**, with `@prose` on a line of its own — its paragraphs
    stay on the page. *Help & documentation*'s specimen shelf is the one that uses it.
  - **Notes that report what is about to happen stay where they are**: why a field is disabled, that a
    collection will be created, that a mode will be removed at Run. A description moves behind a hover;
    a consequence does not.

- **Every field label is sentence case, the way Figma writes one.** 87 of the plugin's 123 labels had
  never been written by anyone: with no `@label:` set, the name of the variable was split at its
  capitals and left there, so `fileKeyOrUrl` read as *File Key Or Url* while the 36 hand-written labels
  beside it were sentence case. The plugin disagreed with itself on the first thing anyone reads. Your
  config blocks are untouched by this — nothing starts writing `@label:` into them.

- **Helper text explains the control it is attached to, in plain words.** A pass over every explanation
  in the shipped scripts: the ones that named a variable in the source rather than the field on screen
  ("leave `searchFor` empty" where the label says **Search for**), the ones that only repeated their
  own label, and three broken sentences. Notes that had been parked under a section heading now sit on
  the control they describe — *Amount* and *Hue* in Colors, the collection and payload fields in
  Export/import.

### Fixed

- **"New mode" adds a mode; it no longer renames the one you had and writes through it.** A collection
  that has been in the file for months, whose single mode nobody ever bothered to rename, is still
  called *Mode 1* — and `getOrCreateMode` treated that name alone as proof the mode was a placeholder
  Figma had just made. Choosing **New mode** and typing a name renamed it instead of adding one, so
  every value in the only mode the collection had was overwritten by the run. Found on a colour
  collection with sixteen variables in it: *New mode / Lime-2* came back as sixteen updated variables
  and no new mode. The placeholder rename is still there, because a collection created seconds ago
  should not be left with a stray *Mode 1* column beside the mode you named — but it now asks the
  question that actually decides whether renaming is safe: **is there anything in this collection to
  lose?** An empty collection cannot lose a value to a rename. A collection with variables in it gets
  a real second mode. Affects **Selection to variables**, the only script that uses the mode picker.
- **Renaming a variable group no longer loses the config behind it, or duplicates the tokens.** A
  generated set was found by name, and the name was in three places at once: the manifest's storage key,
  its group field, and its list of modes. So renaming a group — reorganising the variable table, which
  is a normal thing to do to a design system — produced both halves of the same failure at once. The
  panel found no config and offered its defaults over a set sitting right there, and the overview
  reported every one of that set's tokens as missing. Running it again then wrote a *second* set beside
  the first: new variables under the new name, the originals orphaned, and every binding in the file
  still pointing at the orphans.

  Each generated variable now carries a stamp saying which token of which set it is, so a set is found
  by identity and a name is just a label — the same way a Figma binding survives a rename. What this
  changes in practice:

  - **Rename a group in Figma and reopen the panel**: your config comes back, at the new name.
  - **Rename a group in the panel and run**: the tokens *move*. Same variables, same ids, same published
    keys, so nothing bound to them breaks — instead of a duplicate set and a pile of orphans.
  - **Rename a single token, or a mode**: the run finds it and no longer reports it missing. A token or
    mode that is genuinely deleted is still reported, exactly as before.
  - **Move half a set into another group** and the load says so, naming where the other half went —
    something that was previously invisible outside the variable table.

  Sets made before this keep working and are adopted on the next run; nothing is rewritten or deleted to
  migrate them. Colors is unaffected, since it does not write variables yet.

- **Loading a Typography config no longer turns the font weights into a text style per character.** A run
  promotes the panel's `400, 600` into the map it names styles from, and that map is what the collection
  records — so loading it back put `{ 400: 400, 600: 600 }` into a field that holds a comma list, where it
  became a *string*, and the next run enumerated that string's characters: `Text-Tiny/0` through
  `Text-Tiny/28`, under every token in the scale. The weights come back as the list they were written as.
  A map that names its weights (`{ Regular: 400 }`) is a different statement and still comes back as one,
  read-only in the form and editable in Configuration code — where before it silently degraded to text.

- **A foundation script no longer opens on "New collection".** The picker cannot tell a shipped default
  from a name somebody pasted, so a default of `Responsive System` in a file without that collection landed
  on *New collection* with the name already filled in — the panel's first statement being that it was about
  to create something. Typography, Spacing, Corner radius and Grid now ship no collection name, so the
  field opens as the plain dropdown Colors already was: pick one of this file's collections, or ask for a
  new one.

- **Pointing a panel at a collection and group now loads the tokens that are there**, whether or not a set
  was ever recorded. Only Grid read the file's variables when nothing was recorded; every other domain gave
  up, so opening Typography on a file holding four tokens showed the shipped ten. It reads the **names**
  only — recognising *how* a set was built is a much larger question, and a panel opening on somebody's
  collection is not asking it. Every scale control keeps what it holds, so a real set loads and you adjust
  it from there.

- **`figma:ui readAutoImport` now says *why* a set was not loaded.** Every refusal used to look identical
  from outside — the panel simply showed defaults. It reports the reason (`edited: spacings`, `no parser`,
  `current block did not parse`), which is how the stale-source race above was found. Dev-only.

- **Opening a foundation script now loads the set the file already has.** Auto-import only ever filled when
  you *changed* the collection or group — opening a script ran a read-only pass, so a file with a recorded
  set still showed the shipped defaults. The guard was a proxy for the thing that matters: nothing should
  fill over values you typed. That is now asked directly — a block still equal to the script's own source,
  bar the address, has nothing in it anybody typed, so the set loads into it; an edited block is left alone.

- **Typography never recorded the set it wrote, so its panel could not load one.** Spacing, Corner radius
  and Grid all write a manifest onto the collection when they run; Typography was the last domain that did
  not. The read half had been built — the block carries `@fromFile: domains.typography` and auto-import
  knows how to fill from it — so opening the script in a file that already had a typography set showed the
  shipped ten token names over the four the file actually holds. A test now fails if any foundation script
  writes variables without recording what it wrote.

- **Clicking anywhere in a cell opened its ⓘ explanation and pinned it there.** A `<button>` is a labelable
  element and the cells were `<label>`s with no `for`, so the explanation became the cell's control and every
  click in the row was forwarded to it. It read as the whole row being a hover target, which is why nothing
  in the hover handling touched it. Cells carrying an ⓘ — and every curve, whose dropdown had the same
  problem — are now plain elements.

- **The curve's ⓘ tooltip stayed open while you worked in the row.** Dragging a handle calls
  `preventDefault`, which stops focus moving — so once the button had focus its bubble never dismissed, and
  it read as the whole row being a hover target. Grabbing a handle now takes focus, which also means the
  arrow keys work straight after a drag.

- **Large typography specimens were cut off top and bottom.** A line height below the font size is a real
  choice, but it puts the glyphs outside their own line box and the horizontal clip took the rest. The row
  now reserves the height it needs and clips sideways only.

- **The curve editor overlapped the field below it.** Its height came from `aspect-ratio` on the canvas, so
  the row was sized from a width the grid had not finished resolving — measured at 304.88px, painted at 320,
  and the control hung 15px into the next row. Stating the height removes the dependency. The label also sat
  halfway down a 400px control; it now lines up with the row of buttons at the top.

- **`setField` could not reach a radio inside a mode's fields, and said it had.** The cell carries the field
  name on a wrapper, so the command set a property on a `<div>`, changed nothing, and reported success —
  which made every *Scale type* in Spacing, Corner radius and Typography undrivable from the terminal. The
  curve editor had the same shape, and `readForm` reported a curve as `null`. Dev-only tooling.

- **A scale the generator refused now says so, instead of drawing plausible numbers.** A mode whose model
  could not produce a sequence — a bezier ramp with no largest value, a metric one with no step — fell back
  to the minimum for every missing step, and the monotonic guard then walked those apart by the rounding
  grid. The result was a complete-looking ladder of invented numbers and a console warning nobody reads.
  Spacing, Corner radius and Typography now print the reason where the preview would be, and a run stops
  rather than writing.

- **A base of `0` is a base.** `!sizes.base` read it as a mode that had declared nothing, so the viewport
  silently produced no values — and the path it took was missing a field the caller used unconditionally, so
  it crashed with `Cannot read properties of undefined` rather than reporting anything.

- **The batch rename and rebind examples now work if you type them.** Every one of the five scripts
  showed its example as `"50, 050",` — quoted, comma-terminated — and the parser splits each line at
  its **first** comma and keeps the rest verbatim. Pasted in as shown, that renamed `"50` to `050",`,
  quote and comma included. The examples are bare pairs now, and the note says so: no quotes, no
  trailing commas.

- **A helper no longer breaks its lines wherever the source file happened to wrap.** Every newline in a
  config block's comment became a hard line break on screen, so an explanation wrapped at the `.js`
  file's margin arrived with breaks mid-sentence — 18 of them across the shipped scripts. A line break
  in a paragraph is a wrap now, as it is everywhere else in markdown; a blank line still starts a new
  paragraph, and a list is still a list.

- **Picking a ratio in the panel now generates a scale.** A dropdown's value is text, so choosing
  *1.25 Major third* wrote `ratio: "1.25"` — quoted — and the generator, which accepts a number or a
  ratio's name, answered "unknown ratio" and produced nothing for that mode. Numeric dropdowns read back
  as numbers, and a quoted number is understood wherever a ratio is accepted, so a config typed by hand
  behaves the same way.
- **The Design System Foundations scripts no longer ship a three-viewport system.** `desktop`,
  `tablet` and `mobile` were an example of one Figma file, and shipping them in `grid`, `spacing`,
  `typography` and `corner-radius` made them the plugin's opinion about every file — running any of
  the four on a new collection created those three modes. Each block now ships **one starter mode**,
  named `Value`, which is what Figma's variables panel shows for a single-mode collection; a
  collection cannot exist with no modes, so one is the floor rather than none. Point a panel at a
  collection and its real modes replace the starter. **If you relied on a fresh run producing three
  viewports, it now produces one** — add the rest with `+`, or point the panel at a collection that
  already has them.
- **A panel no longer proposes creating a mode your collection does not have — and a run no longer
  creates one.** The shipped Spacing block names `desktop, tablet, mobile`; point it at a collection
  whose modes are `Desktop / Pad / Mobile` and `tablet` matched nothing, so it sat there as a fourth
  tab. It was not cosmetic: mode setup takes the config's mode list literally, so **running created a
  `Tablet` mode nobody asked for**, in any file whose viewports are named differently from the
  script's defaults. A mode block the collection has no mode for is now removed and **named** in the
  line under Group, so it is never a silent deletion. Pressing **+** still creates a mode: that is now
  recorded as an intent, which is what tells a mode you typed apart from one the template shipped —
  the two are identical in the config, and treating them the same is what caused this. One caveat, by
  design: pasting a config written for a different collection now drops the mode blocks this
  collection has no modes for, each one named.
- **A panel now shows every mode the collection has, not only the ones its config knew about.**
  Pointing Spacing at a five-mode collection — Desktop-large, Desktop, Tablet, Tablet-small, Mobile —
  left the panel on the script's three, correctly spelled and in the file's order, with two of the
  collection's modes silently missing. The collection's modes were already being read; that read was
  used to reorder, re-spell and report, and never to add. A mode with no settings here now gets a
  block, in its position, **written like the mode next to it** — so the values on a new tab are a
  copy of its neighbour and a starting point, not a reading of your file, and a line under Group says
  so. A mode you removed with the dash is never put back. Previously this alignment also ran only when
  a script opened, so *choosing a collection from the dropdown* — the obvious way to ask the question —
  did less than opening the script did; both paths now do the same thing.
- **Modes are shown in the collection's order.** A loaded config listed its modes in whatever order it
  had been stored in, which on a five-viewport system — Desktop-large, Desktop, Tablet, Tablet-small,
  Mobile — reads as no order at all. The chips and the Mode settings tabs now follow the order Figma
  has for that collection, which is the order you see in the variables panel and the one the plugin
  cannot change. A mode the file does not have yet follows the ones it does, rather than being dropped
  or setting the order itself.
- **Applying a suggestion or editing a mode chip keeps you in the mode you were editing.** The panel
  rebuilt itself after either and landed back on the first tab, so a change made in Tablet looked like
  it had gone to Desktop — the preview and the suggestions followed the jump too.
- **Loading a config no longer gets undone a moment later.** When settings loaded from a file, the form
  had not caught up with the text, and the next thing that touched the panel wrote the old values back
  over the new ones. Affected every automatic load, not just the recognised ones.
- **Selection to variables shows its results.** The Info panel it promises had never appeared: the
  call that opens it carried two functions, which cannot cross into the panel, so it threw before
  drawing anything and took the rest of the run's reporting with it. Variables were still created —
  only the list of what happened was missing.

- **"New collection" now gives you somewhere to type the name.** Choosing it from any collection
  picker left the select sitting on an option that appeared to do nothing: the name field only ever
  revealed itself for a collection name that arrived in the config already, which is the pasted-config
  case rather than the one you click. It also no longer disappears from under you when the file's
  collection list finishes loading a moment after you picked.

- **Editing a settings form no longer drops a mode's name.** Under the mode tabs the name is not shown
  — the chips above it are the name — and reading the tabs back rebuilt each mode from the fields it
  could see, so the first edit to *any* setting deleted every mode's name from the config. Nothing in
  your file was affected; the config in the editor was. A panel now only overwrites what it actually
  shows, so a setting it has no field for survives being read.

### Removed

- **Two type tokens that held the same value, and one that was a pixel from another.**
  `--font-size-caption` and `--font-size-helper` were both 10px and differed only in which part of the
  stylesheet used them; they are one token, `--font-size-small`. `--font-size-headline` (15px) sat one
  pixel from `--font-size-title` (16px) — two sizes that close read as an accident rather than a
  decision — and is gone, its three users now either the 20px document title or the 16px section size.
  `--font-size-code` (11px) is new and monospace-only: a mono face at the body's 12px reads larger than
  the prose beside it, which is the one reason an 11 belongs in the sheet.

- **The import button is gone.** Auto-import replaced it: choose a Collection and a Group, and a
  recorded config loads itself with a line under Group saying so. The button only ever appeared when
  it had something to offer, which meant working out whether it *would* appear was a question you
  could not answer by looking — and it appeared a beat late after a run, which is now moot rather than
  fixed. Nothing else about loading changed: it still writes into the editor only, and your file is
  unchanged until you run.

### Fixed

- **The configuration panel no longer gets slower the longer you work in it.** The form's `change` and
  `input` listeners sit on a container that outlives the form inside it, and nothing removed them — so
  every rebuild of the form added another pair, and one keystroke ran the whole pipeline once per rebuild
  that had ever happened. Colors rebuilds the form most (mode chips, auto-import, a collection change, a
  model switch), so it degraded fastest: deleting a digit came to take about a second.

- **Dragging a curve handle is smooth.** Moves are coalesced to one per animation frame instead of one
  per pointer event, the config editor is no longer rewritten mid-drag — the text is committed when you
  let go, and flushed before anything reads it — and dragging one curve no longer redraws every other
  curve on the page.

### Changed

- **Selection to variables writes its results down without opening the panel over your file.** The Info
  panel still holds the whole run — every variable, its value, and whether it was created or updated,
  each row still clickable to select the layer — and the button still shows there is something in it.
  It just stays where you left it. The notification is the outcome; a panel that takes over the window
  to say the same thing in more words is the plugin talking over the work. Scripts can ask for this
  with `autoOpen: false` on `displayResults`; the default is unchanged, so every other script still
  opens the panel for anything that is not a plain success.

- **The preview says how far a change is, not only how many steps it touches.** Now that a read reproduces
  a collection closely, an untouched one reports ten of sixteen steps "changed" — every one by a few levels
  out of 255, which nobody can see. It now reads *"10 of 16 steps would change, by up to 4 of 255"*, and a
  difference too small to see is named as one.

- **A read now lands within 10 of 255 in either colour model, on every scale.** It was 49 in HSL and 37 in
  OKLCH, and the cause was that *where a ramp turns* was being decided twice: recognition read its three
  anchors at the middle of the step list, while the generated ramp bent at its own midpoint. Those are one
  fact. Real sets mostly turn at 400 while the midpoint of a sixteen-step list is 300, so the anchors were
  read at one step and applied at another.
  It is now found by measuring — generating at each candidate step and keeping the one closest to the file
  — and recorded, so generation bends where the anchors were read. Two properties of the colours were tried
  as a rule first and both failed: anchoring on the peak of OKLCH chroma is right for OKLCH and leaves HSL
  at 60, anchoring on the peak of HSL saturation is the reverse at 67.

- **Hue can carry its own curve.** Worth little on a cool palette (under 6°) and a lot on a warm one — an
  amber ramp travelling 49° came back 10° out and is now within 1.2°. Only fitted where there is enough
  chroma for a measured hue to be a value rather than rounding, which on a greyscale it is not.

- **Colour has its own curve, not the lightness curve's timing.** Chroma used to be rebuilt by
  interpolating three anchors on the *lightness* curve's schedule, so a palette was paced by its ladder
  rather than by itself — Tailwind blue came back a third less colourful than the file at its most
  saturated step. A read now fits a chroma curve too, and the worst-step error drops from 0.026–0.067 to
  0.002–0.007. It is the same kind of curve as the lightness one, in the same editor: chroma is not
  monotone, but each half of it is, and two half-fits joined at the peak is exactly a three-anchor curve.
  Leaving it empty keeps the old behaviour, so nothing already made moves.

- **A read recognises the curve the collection was already drawn with.** Opening a colour set used to land
  on *Original* — the file's values and an empty curve editor — because a ramp carries no record of how it
  was made. That is true of naming a preset and false of fitting one: a fitted three-anchor curve lands
  within about a lightness point of published sets (Tailwind zinc 0.86, slate 0.64, blue 0.52, Radix gray
  0.94) against 4.0–6.8 for the closest named curve. The dropdown calls it **Estimated original**, and
  selecting it again restores it after you have bent it elsewhere.

- **Colors opens empty, and fills in as you answer it.** Nothing below *General* until a collection is
  chosen, and no preview until the colour tokens are named — it used to draw a full ramp over a placeholder
  list, which reads as a result rather than as an invitation. A new scale starts on **Linear** rather than
  *Original*, which names nothing on a collection that has no ramp yet.

- **Steps is now called Color tokens.**

- **Colors has one curve, not two.** *Lower* and *Upper* are gone; a colour ramp is described by a single
  curve running bright to dark, and *Add middle point* is what bends the two halves differently. In **HSL**
  that is one curve per mode; in **OKLCH** it is one curve for the whole collection, which is what makes
  every mode land on the same lightness ladder and match in greyscale.

  The curve's middle anchor now *is* the middle lightness and the step it sits on, so the separate **Middle**
  lightness field is gone — it was a second answer to a question the curve already answered, and the two
  could disagree. Existing configs written with a *Lower* and an *Upper* curve are joined into the single
  curve they always described, reproducing their ladders to under 1e-6; nothing you have made moves.

  One capability goes with it: a half on *Original* while the other half was a curve. A curve is now either
  *Original* — the file's own colours, untouched — or a shape spanning every step.

- **Bezier is the default scale everywhere.** Spacing and Corner radius ship it now too, so a fresh panel
  opens on the model the whole thing is built around rather than the one you have to switch to. The starter
  numbers change with it — a geometric ramp does not land on a flat 4/8/12/16 grid, and that is the model
  showing what it is.

- **The curve dropdown is the shape control, and *Custom* is a real state.** Picking Custom on a straight
  line now gives you handles to drag; it used to do nothing, because "is there a shape" was derived from
  "is the curve bent" and a straight line is not bent. *Linear* clears them again. An untouched curve still
  stores `[]`, so an unrelated edit does not write coordinates nobody chose.

- **Typography: a rounded size says so beside itself** — `Font size: 218 (218.37)` rather than a separate
  *Rounded from* line at the bottom of the block, which left you matching it back to whichever value it
  belonged to.

- **Typography: line height and letter spacing are one row each, in percent.** `[Base][Max]` with the unit
  drawn inside the field, and the numbers are percentages of the font size — Figma's own unit for both, and
  unlike a pixel value a percentage still means the same thing after the scale grows. The variables are
  still written in pixels, computed per token, so nothing downstream changes. A config from before this
  spells them as bare numbers and keeps generating exactly what it always did; the two are told apart by
  **shape** rather than by range, because `-1.2` is equally plausible as −1.2px or −1.2%.

- **The script log is for errors and warnings.** A successful run used to fill it with a summary of what it
  had just done, which buried the one case the block exists for. The lines are still captured and still
  reach the dev bridge. Spacing and Corner radius also stopped repeating the scale table into the results
  panel — the Configuration tab already draws it, live, and the copy went stale on the first edit.

- **The scale editor is one control.** The growth has no field of its own, the *Add shape* button is gone,
  and the dropdown does that job — *Linear* means no shape and draws no handles, anything else reveals them.
  The field underneath always carries the whole scale, `1.5 cubic-bezier(0.333, 0.333, 0.667, 0.667)`, so
  copying it out and pasting it back reproduces it; it takes a growth alone, a curve alone, or both. The
  growth is still written to the config under its own name, so a block reads `ratio: 1.5` beside `curve: []`.

- **The scale curve is open-ended again: a base, a growth ratio, and a shape — no largest value.** The first
  version of this asked for both ends and distributed the tokens between them, which was wrong twice over.
  Nobody knows the largest spacing in advance; and pinning both ends meant **adding a token re-subdivided
  the range and moved every value below it** — six variables already bound to things in a file, silently
  changed because somebody added a seventh. The top is now derived from the ratio, so the step count cancels
  out: a flat curve is a modular scale exactly, and appending a token leaves everything before it alone.

  The **named ratio dropdown is gone**. It was a closed list of eight, and the complaint was that nothing
  sat between 1.25 and 1.333. Growth is a plain number now, and the curve's y axis is **logarithmic** — so a
  constant ratio is a straight line whose slope *is* the ratio, and you drag it. **Add shape** reveals the
  bezier handles for when the growth should vary across the scale. Past the last token the line continues
  faintly, because the scale does.

  Colours are unchanged: lightness is bounded, both ends are known, and the two-anchor editor is right there.

- **Spacing, Corner radius and Typography: *Modular scale* is now *Bezier scale*, and generates the same
  numbers.** A modular scale is a constant ratio between steps, which in log space is a straight line — so
  the curve model with a straight curve *is* a modular scale, checked term for term. What it adds is the
  ability to bend it: the ratio can vary across the scale, so a spacing set can stay tight at 4, 8, 12 and
  still open out at the top, which one ratio could never say. A bezier mode takes **Largest value** and a
  **Curve** where it used to take a *Scaling method* ratio.

  **Configs that say `modular` keep working and keep generating exactly what they generated before** — the
  ratio is converted to the equivalent ramp. Nothing in an existing file is regenerated to a different
  number, which matters because these values are already bound to as variables. Typography's shipped default
  moved from `modular`/`1.25` to `bezier` with a largest size of 60, and produces the identical ten sizes.

- **Colors: the Family, Easing and Amount dropdowns are now the curve editor.** The lightness ladder's lower
  and upper segments each get one. *Original* — the ramp already in the file — is still there, spelled as a
  curve with no points. Configs carrying the old `{ family, easing, amount }` are converted on read;
  `linear`, `quad` and `cubic` convert exactly, and the rest are within 0.01 of the range, which is
  documented per family in `@Bezier`.

- **One heading ladder, and one title per script.** The Documentation tab and a script's settings form
  render the same markdown, and until now they styled it with separate rules — `## Overview` was 15px in
  one tab and 14px in the other, and every heading question had to be asked twice. There is now a single
  ladder both read: **`#` 16px, `##` 14px, `###` 12px semibold**, with body copy at 12px. The **document
  title in the editor header is the only text above that, at 20px** (it was 15px), and it is where a
  script's name lives.
  - **The duplicated titles are gone from the scripts themselves.** Every doc block used to open by
    repeating the script's own name, and most config blocks opened by repeating it a *third* time in a
    third wording — "Rename variables" in the sidebar, "Rename variables" again as the first heading,
    "Batch rename variables" over the settings. 70 of those lines were removed across 49 scripts. If you
    write your own scripts, you no longer need a `# Title` line at the top of a doc or config block; the
    header names the script. Existing user scripts are untouched and still render their title if they
    have one — it will simply be a 16px section heading rather than a 20px page title.
  - Genuine section titles were kept, including the ones that only *look* like a repeat: `@codefig-ui`'s
    "Built-in components", match-colors' "Palettes", and export/import's `# Export` / `# Import` pair.

- **Sizes and corners come from tokens now, so the same thing looks the same everywhere.** Seventeen
  font sizes and twenty-four corner radii were written as raw pixel values, which is how "the same
  corner" came to mean 2, 3, 4, 6, 9 or 10px depending on which control you were looking at. Every one
  is now one of four radii and one of five sizes. Two things visibly change: **11px text that was not
  code is now 10px** (status pills, dropdown group headers, stale-config notices), and **the `@rows` tab
  strip is 12px, matching the Documentation/Configuration/Script tabs it was always meant to match.**

- **Selection to variables picks its collection the same way every other script does.** The dropdown
  now lists this file's collections with a **New collection** entry that reveals a name field, instead
  of a *New collection* mode that took the collection name off the front of each layer name. **This
  changes what your layer names mean:** a layer called `color - bark/bark/350` used to make collection
  `color - bark` and variable `bark/350`, and now makes variable `color - bark/bark/350` in whichever
  collection you picked. Name layers by the variable path alone — `bark/350` — and choose the
  collection above. The old rule was also inconsistent with itself: picking an existing collection
  already treated the whole layer name as the path, so the same layers landed in two different places
  depending on a dropdown.

- **A settings form's heading sizes now step evenly:** 16 / 14 / 12, two pixels a level, with the
  smallest told apart from body copy by its weight. They were 20 / 14 / 14 — a jump, then no step at
  all.

- **Grid's config block lists its settings in the order the panel shows them** — collection, group,
  extra columns, then the per-viewport modes. A visible diff if you paste that block around, and no
  change to what any of it does.
- **Selects are the same height as text inputs.** They were two pixels taller everywhere, which only
  became obvious once a form put the two side by side. They also have a chevron of their own now
  instead of the browser's.
- **Rounding is spelled one way.** `roundTo` sits beside the other settings instead of inside
  `scaling`, because it applies whatever model a scale uses, while `scaling` describes a curve that
  only the `endpoints` model reads. Spacing and Corner radius shipped with
  `scaling: { type: "sine", ease: "in", roundTo: 2 }` above sets that all said `model: "metric"` —
  two descriptions of one scale, two of the three fields inert, and nothing to tell you which was
  live. Every old spelling still works and is promoted for you: `scaling.roundTo`,
  `roundUpperValuesTo` and the `fontScaling` alias all mean the same thing. A curve is only
  recorded when something reads it.
- **A mode that is not a viewport is left alone.** If a collection's modes are a density axis —
  `tight` / `relaxed` — rather than breakpoints, CodeFig says so and does not add them to your
  viewport list. Previously it adopted any mode it did not recognise as a viewport, which meant the
  tool decided which axis your collection used. Figma gives a collection one mode axis, so that is
  your decision. The message carries the way in: *"The registry is untouched — add them in Grid if
  they're breakpoints."* A file that has no viewport list yet gets one sentence pointing at Grid
  rather than a complaint per collection.
- **A scale can be described once instead of once per breakpoint.** Spacing and Corner radius take
  a list of parameter sets, each saying which modes it applies to. `appliesTo: "*"` means every
  mode the collection already has — the common case, which previously had to be written out once
  per viewport. Add a second set naming one mode and it overrides the wildcard there; the run says
  which set won for which mode. Two sets naming the same mode outright is a contradiction nobody
  can resolve from the config, so the run says so and writes **nothing at all** — no collection, no
  variable, no recorded set — rather than applying part of it. Configs written the old way keep
  working and are read as one set per mode.
- **A wildcard never creates a mode; naming one does.** `appliesTo: "*"` describes the modes a
  collection has, so it cannot add to them — otherwise a collection would gain modes whenever your
  viewport list grew. Naming a mode is a request, and a named mode missing from the collection is
  created. A collection that is new, or still has only Figma's default *Mode 1*, is seeded from the
  file's viewport list, and the run says which of the two happened, because only one of them
  changes the shape of your collection. With neither, the run says so and points at Grid.
- **Find/replace now means one thing across the library.** Six scripts took a name pattern and
  no two agreed: contains vs prefix, case-sensitive vs not, wildcards in three of them, three
  separate replace implementations. All six now share one matcher.
  - Matching is **contains** and **case-insensitive** by default. Tick **Match case** for
    case-sensitive.
  - `*` is a wildcard in every field that takes a pattern. A CodeFig extension — Figma has no
    wildcard.
  - **Regex is an explicit toggle.** It used to be inferred from the presence of brackets or
    parens, which silently mangled ordinary names (see Fixed). Tick **Use regular expression**.
  - A **blank find replaces the entire name**, matching Figma's blank Match field.
  - `rename-variables` scoping works the way it reads: `Typography/Body` now scopes to that
    group. It previously matched a case-sensitive prefix against a spaced-slash path, so the
    obvious spelling matched nothing.
- **Preview is on by default** in `rename-styles`, `rename-variables`, `replace-styles`,
  `replace-variables` and `replace-style-variable-bindings`. A run lists what it *would* change
  and changes nothing; untick **Preview only** and run again to apply. Rows are flagged when the
  new name already exists, when two rows produce the same name, when a pattern matched but
  changed nothing, or when the result would be empty. `select-by-styles-variables` has no
  preview by design — it only changes the selection.
- **`$n` / `$N` counters are positional**, so they depend on the set of matches. Preview and
  apply are two runs; if the file changes in between, the numbering moves. The apply run now
  says so when the plan no longer matches what was previewed.
- Scripts that gained capability they did not have: `replace-styles` and `replace-variables` now
  support the `$&` / `$1` replacement tokens; `select-by-styles-variables` and
  `replace-style-variable-bindings` now support `*` wildcards.
- Figma's default `Mode 1` on a newly created collection is now renamed to your first viewport
  rather than deleted and replaced, which uses one fewer mode from your plan's budget.
- **The shipped Spacing and Corner radius defaults now generate a metric scale, not an endpoint
  range.** A metric scale is a base plus a step that grows every few tokens — 4, 8, 12, 16, 24, 32
  — which is how a spacing scale is normally written down. The previous default ran a curve
  between a minimum and a maximum, which meant working backwards from the numbers you wanted to a
  curve that happened to pass through them.

  **Your own configs are untouched.** A config with no `model` is read as `endpoints`, so anything
  you have configured produces exactly what it always did. What changes is the *starting point* in
  the shipped script — and because prebuilt scripts reload from the embedded source, that reaches
  you on upgrade if you have been running the shipped block as-is.

  Two things make that visible and reversible. Every run now prints the model and its parameters
  next to the created/updated counts — *"Desktop: metric, base 4, step 4, mod 3"* — so if the
  numbers move, the reason is in the output that reports the move. And if the file already has a
  recorded set, the **import button** hands your previous config straight back into the config
  block: that only works because the config shape and the import landed first.
- **Spacing and Corner radius record what they generated**, so the import button and
  `figma:run --from-file` can offer it back. Nothing about the variables they produce changes —
  the two scripts now share one generator, and a test proves the collapse value for value against
  frozen copies of the code it replaced.
- Grid now honours a nested `{ config: { collectionName, group } }` config the way Spacing,
  Corner radius and Typography always have. Previously it read only the top level, so a pasted
  config quietly wrote to `Responsive System`.
- **Import this file's config into a Design System Foundations script.** A button beside the
  results button fills the config block from what this file already has, in one click, and names
  where it came from — *imported from Responsive System · Spacing*. It appears only when this file
  actually has a config for that script. **Nothing is read from your file until you press it**, so
  a config you paste into the editor is always the config that runs, and Cmd-Z undoes an import.
  The imported values live in the editor, not in the script: switching scripts and back brings the
  shipped defaults again, and one click brings your file's settings back.
- `npm run figma:run -- <script>` still runs the script's own config. `--from-file` imports this
  file's config first, the way the button does; `--config <path>` supplies one explicitly. Every
  run prints which of the three it used.

### Fixed

- **The import button works again.** It reported that the config could not be read, on every file,
  whatever the config said. The text was fine — the button was calling something the UI had no way
  to reach.
- **Importing a config keeps your comments.** The import button used to replace the whole config
  block, so every note you had written in it was gone and Cmd-Z was the only way back. It now fills
  values into the block that is already there: anything the file does not have a value for comes
  out byte-identical, including comments, blank lines and the order you put things in. Where the
  shapes differ it says so — a viewport the file has and your block does not is added in the style
  of the entry above it, and one your block has and the file does not is removed **along with the
  comments written for it**, named in the summary so a deleted annotation is something you are told
  about rather than something you find later.
- **Your config no longer comes back with CodeFig's working notes in it.** A recorded set carried
  the resolver's own intermediate state — the sizes it worked out, which set overrode which — and
  handed it back as though you had written it. Only fields the config format declares are stored
  now. The same fix restored two things that were being quietly lost: parameter sets vanished from
  a recorded set entirely (so importing one fell back to the older per-viewport form), and
  Typography's `fontFamily` and Colors' themes were being kept in a bucket for unrecognised
  settings, which meant an untouched default config warned about itself the first time you ran it.

- **CodeFig no longer suggests deleting a variable collection, and will not delete a published
  one.** A variable's id and its published key are created with the variable: delete and recreate
  it and every layer bound to it loses its binding, while every file subscribing to your library
  gets a "missing variable" it cannot relink. Renaming is safe. Two places got this wrong. When a
  collection's modes matched your config but sat in a different order, the run told you to delete
  the collection and start again — it now recommends living with the order, says what deleting
  would cost, and says when your collection is published so the cost would land in other files
  too. And `merge-variable-collections` removed the source collection unconditionally; it now
  refuses when that collection is published, and no longer falls back to deleting its variables
  one by one.
- **An array or object value in a script's config form is no longer replaced with text when you
  edit another field.** A value like `var tags = ["a", "b"];` had no form control of its own, so it
  was shown as an editable text box holding `a,b` — and because the whole config block is written
  back whenever any field changes, touching an unrelated control replaced the list with the string
  `"a,b"`. These values are now shown read-only, with their own formatting kept exactly as you
  wrote it, until a control exists that can edit them; edit them in the Script tab meanwhile. No
  script that ships with CodeFig had such a field, so this only ever affected config forms you
  wrote yourself.
- **Running a Design System Foundations script no longer deletes variable modes it does not
  recognise.** Previously, because all four scripts share one collection and each carried its own
  list of viewports, running one could remove another's modes — and every value stored in them.
  Renaming a viewport in one script, or adding a mode by hand, was enough. Modes are now only ever
  added; anything else in the collection is reported and left alone.
- **A token value of `0` is now written.** It was silently skipped, so a spacing or radius token
  could not be changed *to* zero: the old value stayed and nothing was logged.
- **`searchFor = "Text [Legacy]"` no longer mangles unrelated names.** Regex auto-detection read
  `[Legacy]` as a character class, so `Text Legacy Body` became `Textegacy Body` with no warning
  and no preview. Same class of bug: `Brand (2024)/` also renamed `Brand 2024/Accent`.
- **An unconfigured rename no longer empties every name.** With the new blank-find rule, running
  `rename-styles` or `rename-variables` on an untouched form renamed everything in scope to an
  empty string. Both now refuse a run with nothing configured, and skip any rename that would
  produce an empty name.
- **`corner-radius` and `spacing` no longer crash when a grid size is set.** Both called
  `roundToGrid()`, which was declared only in `typography`, so the call threw `ReferenceError`
  on that path. All three now use `snapScaleGrid()` from `@Math Helpers`.
- **A documented `@import` example no longer runs as a real import.** `@import` inside a
  `// @DOC_START` … `// @DOC_END` block is now treated as documentation. Opening **Help &
  documentation** showed an "Import failed" notification for the placeholder
  `@import { myFunction } from "My Custom Script"`, and its other three examples were injecting
  library source into the script for no reason. Write examples in your own doc blocks freely;
  outside a doc block, a commented-out `// @import` still imports, unchanged.
- Wildcards work in the default match path again (`compilePattern` produced "zero or more
  literal dots" from every `*`).
- Three libraries were real TypeScript, which made 60 of their 71 functions impossible to
  import; imports that appeared to work were resolving to nothing.
- `scripts/HELP/` is typed as `help`, not `prebuilt`.

### Removed

- **`distributeToMaxColumns` is gone from Grid.** It could make `col-6` mean "the same fraction of the
  grid as 6 of 12" rather than "six columns", by rounding the span for modes with fewer columns. The
  rounding made tokens collide: on an eight-column mode `col-1` and `col-2` were both one column, and
  `col-4` and `col-5` were both three — twelve variables holding eight distinct widths, with `col-6`
  measuring four columns. `col-s` is now always the width of `s` columns of that mode. If your config
  still sets it, the run says so and ignores it; if it was `true`, your `col-*` values change on any
  mode whose column count differs from the largest.

- 42 scripts that never shipped. Everything under `scripts/` now ships, apart from `_TESTS/`.

### Developer

- **`@rows`** — a repeatable-group control for a config field holding a list of objects. Add and
  remove rows; `@tabs` renders one tab per row using its `name` instead of stacking them, which is a
  display choice on the same control rather than a second control with its own serialization. A
  column can carry a fixed set of options: `model:(metric|modular|endpoints)`, parenthesised because
  the column separator is already a pipe. An untouched `@rows` line round-trips byte-identical, and
  the annotation survives the form changing the value — without that, the second interaction would
  render the field as an uneditable array.

- **One canonical config shape.** A single v1 shape now covers paste, the per-set manifest and
  export, with one compat reader in `@Foundation` that accepts every earlier shape and reports
  what it translated — replacing the four half-overlapping readers the DSF scripts each carried.
  `toDomainConfig(v1, domain)` converts back to the shape today's scripts read, so a v1 config
  works with them unchanged; each generator drops its branch of that bridge as it is rewritten.
  v1 carries **declared inputs only**: a run mutates its config in place, and exporting a
  derivation would freeze it.
- **Scales say when something moved their numbers.** Keeping a generated scale ascending can push
  colliding steps apart and pins its ends to the minimum and maximum — quietly, until now. Every
  value that changes is named in the run summary with what it was and why.
- **`@Scale Models`**: four ways to describe a scale — `endpoints` (a curve between a minimum and
  a maximum, what every earlier config is), `modular` (a fixed ratio per step), `metric` (a base
  plus a growing step) and `explicit` (your own numbers). Size sequences only: rounding, the
  monotonic guard, line height and letter spacing all stay with their callers. `max` is a limit
  only in `endpoints` — elsewhere the top comes out of the model, so a `max` beside it is ignored
  and an optional `clamp` warns rather than squashing. The ratio names keep their shipped values;
  a plain number is accepted for an exact one.
- **`@Linear Ramp`**: one generator behind Spacing and Corner radius, which were ~30 near-identical
  functions apart — 88 differing lines out of 916 once the domain words were normalised away, and
  seven values that genuinely differed. Both are now thin wrappers parameterised by tokens, name
  template, scopes and domain, so a fix to the scale maths lands in both. 916 lines became 232 plus
  a 455-line library.
- `createCopyResult` and `requestClipboardCopy` in `@InfoPanel`, replacing the copy plumbing
  written twice in `export-import-variables` and `copy-simple-variables-json`.
- **`npm run figma:run -- <script>` refuses a file that is not a `codefig-test` file**, and prints
  which file it is about to write to. Running a bundled script writes variables into whatever
  document happens to be open — a two-word command with a document-wide effect, and one that has
  already put six variables into a real brand file. `--force` overrides. Snippets through `--code`
  and `--file` are not gated; their author can see what they do.
- Importing a config is a **script run flagged silent**, not a backend feature: the button, the
  run and the CLI all read the file through `readFoundation`, so there is one implementation and
  nothing to keep in sync. A config reaches a run as a prepended `var` that each script's existing
  `typeof x !== 'undefined' ? x : {…}` guard picks up, so no script needed changing. The dev
  bridge's `args` field, carried end to end and used by nothing, now carries it.
- The import button's state is **one derived function** — `configImportState(configBlock, probe)`,
  pure and covered by Node tests — rather than three cached booleans computed at three different
  moments. The file is re-read on script open and after every completed run, including runs the
  CLI started, so a manifest written behind the UI's back cannot leave the button claiming
  something stale.
- `@fromFile:` in a config block declares where a field's value comes from, and survives the form
  serializer's `parse → serialize` round trip — an annotation it dropped would silently remove the
  button from the script.
- **New `@Foundation` library.** One viewport registry per file, one manifest per generated token
  set, and one copy of the helpers that had been written five times across the Design System
  Foundations scripts. Two collections can hold two sets — "Spacing A" and "Spacing B" — while
  sharing the file's viewports. Reading it back reconciles the registry against the collections'
  modes and the `viewport-width` variable, and where they disagree the file wins and the
  disagreement is reported. Nothing generates tokens through it yet; the four scripts adopt it as
  they are rewritten.
- `@import` now prefers an exact script-name match over a substring one. Every rule used to be
  tried at once and the winner was whichever script the build read first, so
  `@import … from "@X"` could resolve to `@X something else`.
- **Run scripts in Figma from a terminal.** `npm run figma:run -- <script>` hands a job to the
  open plugin and exits on its result; `npm run test:figma` runs the in-Figma specs in
  `scripts/_TESTS/`. Both need `npm run dev` and the plugin open — Figma has no headless mode.
  The dev bridge and its queue are localhost-only and unreachable from a production build.
- **In-Figma test harness** (`@Test Harness`) for specs that need the real API. Cases that mutate
  a document only run in a file whose name contains `codefig-test`.
- `npm test` grew from 30 to 130+ Node tests, covering the pieces whose failures are silent:
  the `@import` resolver, the shared matcher, the preview library, the plan/apply split, the
  bridge queue, script-name resolution and the dev-only guard.
- `npm run validate` now fails a build when a runnable script calls a function nothing defines
  after `@import` resolution — the gap that hid the `roundToGrid` crash.
- `validate-scripts.js` carries no per-file exemptions. The doc-block rule above removed the last
  one (`help-documentation.js`), which had been silencing every import check for that file.
- `build:release` bumps with a single `npm version` call instead of bumping, syncing the lockfile,
  staging and committing by hand. That dance existed because builds used to rewrite a tracked
  `manifest.json`; they no longer touch a tracked file. Same commit message, same annotated `v`
  tag, and build + pack still run before the bump so a validation failure stops the release
  before a tag exists.
- Builds no longer touch a tracked file. `manifest.json` moved to `src/manifest.json` as a
  template and the build generates `dist/manifest.json`. **Import `dist/manifest.json` in
  Figma**; existing dev setups must re-import once.
- Builds stamp a build id, so the tooling can tell a stale plugin from a broken one and say
  "reload CodeFig" instead of leaving you guessing.
- `src/ui.css` split out of `src/ui.html`; every script renamed `.ts` → `.js`, which is what
  they always were.

---

## [1.0.6] and earlier

Released before this changelog existed. See `git log` and the GitHub releases; `v1.0.6` is the
last tag that predates the find/replace work above.
