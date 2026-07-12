---
name: phase-gate
description: Run the roadmap's mandatory phase-completion gate for vertical-rush — the verification triplet (pnpm test, pnpm check, the verify skill) plus spec Status-flip and sync checks. Use at every phase boundary, before any commit that claims phase completion, and whenever the user asks whether the current state "passes the gate", whether a phase is done, or wants a full pre-commit verification of gameplay/rendering/difficulty changes — even if they don't say "phase gate".
---

# Phase Gate

Every roadmap phase ends with the same gate (`spec/07-roadmap.md`). Run the
steps in order; if a step fails, report it immediately and stop.

## 1. Identify the phase

Read `spec/07-roadmap.md`, identify the phase being completed, and read that
phase's **Verification** paragraph first — it is authoritative for
phase-specific preconditions and extra runs. Examples:

- P1: the verify skill must pass with **no edits** to the skill file.
- P2: update the verify skill's scan color constant to `#D95763` **before**
  running the triplet.
- P3: run the triplet twice — with assets present and with `public/assets/`
  temporarily moved away.

If no phase is completing (a mid-phase change or a clean tree), the general
gate still applies: run the triplet and the spec-sync review; step 3 then has
nothing to flip.

## 2. Run the verification triplet

1. `pnpm test` — all unit tests green.
2. `pnpm check` — Biome + `tsc -b` green.
3. The `verify` skill (`.claude/skills/verify/SKILL.md`) — both deterministic
   scenarios: `Math.random = () => 0.4` (idle player clears at 240 m) and
   `Math.random = () => 0.9` (crash within ~5 s).

## 3. Confirm spec Status flips

Grep the specs referenced by the phase's scope for `Status:` lines still
reading `planned (Pn)` for this phase — they must all read
`implemented (module symbol)` in the completing commit. Also verify the
phase's **Completion criteria** items (e.g. P1: `src/App.tsx` < 300 lines and
CLAUDE.md's Architecture section updated to the new module list).

## 4. Spec-sync review

Launch the `spec-sync-reviewer` agent to review the working diff (Status
accuracy, source-of-truth tables, global invariants, RND-05 coupling, phase
discipline).

## 5. Report the verdict

List each step's result, then an overall verdict: **gate passed** or
**gate failed** with the unmet items. Distinguish failures caused by the
change under review from pre-existing drift discovered along the way — both
block the gate, but they call for different fixes. Report only; applying
fixes is the caller's decision.
