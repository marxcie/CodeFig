---
name: ux-copy
description: How to write CodeFig's in-panel help text. Use whenever adding or editing a @helper:, a @tooltip:, a heading paragraph, a status or result message, a button label, or any string a user reads in the plugin. Covers what a help text owes the reader, where it goes, and the density faults this codebase actually has.
---

# In-panel copy

## The problem this exists to fix

This codebase's copy already passes every generic UX-writing rule. Measured: median sentence 8
words, 85% under 14, 2% over 25, active voice throughout, no jargon the audience does not use.
`DEFERRED.md`'s "tone pass over the remaining 77 helper texts" records that a general UX-writing
skill would have flagged 13 of 85 texts and none of the real faults.

**Do not run a length-and-reading-level checklist over this copy. It passes, and it is still hard
to read.**

The fault is what the sentences are about. They explain how the system behaves when the reader
asked what to type. Real example, from `colors.js`:

> How the hue travels between the ends. Worth least on a cool palette and most on a warm one,
> amber crosses 49 degrees and needs its own timing. Empty on a near-grey, where a measured hue
> is rounding rather than a value.

Three true facts about the mechanism, no instruction. The reader is looking at an empty field and
still does not know whether to fill it.

Better:

> Controls how the hue shifts from the light end to the dark end. Leave it as it is unless the
> palette is warm, where amber and orange need their own timing.

Same information the reader can act on, in half the words, with the aside dropped rather than
smuggled in.

## What a help text owes the reader

Three lines at most, in this order. Stop as soon as the reader can act.

1. **Do.** What to put here, or what this changes. One sentence. Starts with a verb or with the
   thing itself, never with "This field".
2. **Default.** What happens if they touch nothing, when that is not obvious from the value shown.
3. **Deviate.** The one condition under which the answer changes. One condition, the most common
   one. Not three.

If a text has no line 1, it is not help. It is documentation that escaped into a tooltip.

## The five density faults, in order of how often they appear here

**1. The mechanism aside.** A clause explaining why the system works that way. Usually attached
with an em dash or a "which is". It is the author's satisfaction at having built the thing, not
the reader's need.

> Add middle point bends the two halves differently, which is what a real neutral ramp does, and
> that anchor is the middle colour's lightness and its step.

Cut to: `Add middle point bends the two halves differently.` The rest belongs in the
Documentation tab, where somebody reading about ramps will find it.

**2. Em dash asides.** In this codebase the em dash is the delivery mechanism for fault 1 almost
every time. **Do not use em dashes in panel copy.** If a thought needs one, it is a second
sentence or it is cut. This rule is a proxy, but it catches the real fault reliably.

**3. Teaching the domain.** An info bubble is not the place to explain what a Fibonacci scale is,
what OKLCH is, or why greyscale matching works. Name the choice, and let the Documentation tab
teach.

> Fibonacci. The first increment, the sequence is the base, the base plus this, then each value
> the sum of the two before it.

Cut to: `Fibonacci. The first increment. Each later step is the sum of the two before it.`

**4. Naming the internal concept instead of the thing on screen.** The reader sees a field with a
caption. Use that caption's words. Not the variable name, not the config key, not the library
function. The earlier copy pass fixed 15 of these and more will have crept in.

**5. Restating the label.** A helper that says what the label already says is worse than none,
because the reader spent a click on it. 6 of these were removed in the earlier pass. If the only
honest text is a restatement, write nothing.

## The ELI5 test

Read the text and answer, out loud, as the reader: **"So what do I type?"**

If the answer is not in the first sentence, rewrite it. If the answer is "it depends", the text
needs a default. If you cannot answer at all, the field needs a decision made about it before it
needs copy.

Second test, for length: **count ideas, not words.** Three ideas is the ceiling for one bubble,
and two is better. Sentence length is not the problem here and shortening sentences will not fix
it.

## Where copy goes

**Behind the info button, by default.** Every explanation belongs behind the info button beside a
control's label. This is the house pattern and there is one channel for it: `@helper:`,
`@tooltip:` and a folded paragraph all render into the same bubble. Do not invent a second place.

**A status or result message is the exception.** Anything reporting what just happened, what
failed, or what is in progress is not help and does not go behind an info button. It goes where
the user is already looking. Same three-line shape, different order: what happened, then what to
do about it.

**A `@rows` column or a part caption can carry its own `@helper:`** and gets its own info button.
Use it. The one thing with none is a `@rows` control as a whole, because the renderer builds no
label for it. A helper written there degrades to a native `title` tooltip. If a whole block needs
explaining, put it on the `# Heading` above, which is where the reader is looking anyway.

**The Documentation tab takes everything the bubble cannot.** Mechanism, worked examples, the
reason a default is the default. Moving text there is not deleting it.

## Button and action labels

Verb plus object, 2 to 4 words. `Save changes`, not `OK`. `Generate frames`, not `Run`. Say what
happens, not what the control is.

## Before you write

Read three existing helpers near the one you are writing, so the new one sits in the same voice.
The house voice lives in `CLAUDE.md`, `CHANGELOG.md`, and `scripts/HELP/help-documentation.js`,
not in a style guide.

Write the copy. Do not ask which wording is wanted. If a field's *behaviour* is undecided, that
is a question worth asking, and copy is not the way to paper over it.

## When editing existing copy

Report what changed and why, in one line per text. A copy diff that arrives without reasons
cannot be reviewed, only accepted or rejected.

Do not sweep. `DEFERRED.md` is explicit that the remaining 77 helpers want reading panel by panel
with a person, not one pass over `scripts/`. Fix the ones in the panel you are already working
on.
