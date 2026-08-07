# Frozen references

`spacing-before-19.js` and `corner-radius-before-19.js` are byte-identical copies of the two
generators as they stood immediately before plan 19 collapsed them into `@Linear Ramp`.

They exist for one reason: `tests/linear-ramp.test.js` runs the same configs through the old
implementation and the new one and compares the generated variables value for value. A collapse
is only safe if it provably changes nothing, and "provably" means running both.

Verify they are still the originals with:

    git show b451f8c:"scripts/EXAMPLE_SCRIPTS/Design System Foundations/spacing.js" \
      | diff - tests/fixtures/spacing-before-19.js

## When these go

**In the same commit that lands plan 20** (the typography rewrite), together with the tests that
read them. A note without a trigger is how dead code becomes permanent, so this is the trigger:
by the time typography is rewritten, the ramp has generated real tokens in real files across two
domains, and a frozen copy of the code it replaced has stopped earning its keep.

Delete `tests/fixtures/` entirely and remove the comparison half of `tests/linear-ramp.test.js` —
the manifest-contract and spec-difference tests in that file stand on their own and stay.
