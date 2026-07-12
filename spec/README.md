---
id: SPEC-INDEX
title: Specification Index & Conventions
status: implemented
code: []
---

# vertical-rush Specifications

This directory is the **design source of truth** for vertical-rush. It documents
both the game as it exists today (the pixel-art fantasy town runner and the
short-run casual retune, P0–P6) and the planned work: the P7/P8 drop-in
image theming contract. Specs are written primarily for AI implementers: every
section states whether it describes reality or intent, values are given as
copyable tables and type definitions, and environment gotchas are restated
where they constrain a design.

## Index

| File | Spec ID | Contents |
|---|---|---|
| [01-overview.md](01-overview.md) | `SPEC-OVERVIEW` | Game pitch, redesign direction, glossary, global invariants |
| [02-world.md](02-world.md) | `SPEC-WORLD` | World concept, cast, color palette, art style |
| [03-game-core.md](03-game-core.md) | `SPEC-CORE` | Simulation contract: phases, lanes, scrolling, collision, zones, score |
| [04-entities.md](04-entities.md) | `SPEC-ENTITIES` | Entity registry, spawn tables, item/collection system, target module layout |
| [05-rendering.md](05-rendering.md) | `SPEC-RENDER` | Pixel-art pipeline, sprite-sheet manifests, fallback contract, assets |
| [06-audio.md](06-audio.md) | `SPEC-AUDIO` | SFX catalog, chiptune BGM direction, audio unlock rule |
| [07-roadmap.md](07-roadmap.md) | `SPEC-ROADMAP` | Completed phases P0–P6 (summaries) and planned phases P7–P8 with completion criteria and verification |

Recommended reading order for an implementer starting a roadmap phase:
`07-roadmap.md` (find your phase) → the specs its scope column references →
`01-overview.md` invariants before writing any code.

## Document conventions

### Frontmatter

Every spec file starts with YAML frontmatter:

```yaml
---
id: SPEC-ENTITIES          # stable spec ID, used in cross-references
title: Entity System
status: planned            # planned | partial | implemented
code: [src/entities.ts]    # owning modules (once built)
---
```

`status` at file level is the coarse rollup; the per-section status lines below
are authoritative.

### Per-section status lines

Every `##` section in specs 01–07 (this index is exempt) carries a status line
immediately under its heading:

- `Status: implemented (src/gameLogic.ts checkCollision)` — describes current,
  verified behavior. Code references use `src/file.ts` plus an exported symbol
  name, never line numbers (they rot).
- `Status: planned (P4)` — describes intent, scheduled for the referenced
  roadmap phase in `SPEC-ROADMAP`.
- `Status: partial (...)` — mixed; the section body marks which parts are which.

This is the single most important convention: it answers "does this paragraph
describe reality or intent?" without diffing code.

### Requirement and invariant IDs

Normative statements that other documents or commits need to reference carry
stable IDs:

- Requirements: `<PREFIX>-<NN>` (e.g. `CORE-02`, `RND-03`).
- Invariants: `<PREFIX>-INV-<N>` (e.g. `ENT-INV-1`). Invariants are rules that
  must hold in **every** phase and every commit, not just at feature completion.

Prefixes per spec: `OVR` (overview), `WLD` (world), `CORE` (game core), `ENT`
(entities), `RND` (rendering), `AUD` (audio). IDs are assigned monotonically and
never reused; a dropped requirement is marked `withdrawn` in place, not deleted.
Cross-reference format: `SPEC-RENDER › RND-03`.

### Code blocks: canonical vs illustrative

- A TypeScript block introduced as **canonical** is a contract: copy it
  verbatim into the named target module when implementing (adapting only
  formatting to Biome). Canonical blocks respect the project's compiler
  constraints: `erasableSyntaxOnly` (no enums/namespaces — use union types and
  plain `const` objects) and `verbatimModuleSyntax` (type-only imports).
- A block introduced as **illustrative** shows one possible shape or example;
  the implementer may deviate.

### Source-of-truth tables

A table labeled **source of truth** means: code values must match the table
exactly. Changing such a value requires editing the table and the code in the
same commit. Tables without the label are descriptive.

### Spec–code sync rule

`spec/` is the design source of truth. Any change to gameplay rules, entity
data, the rendering pipeline, or difficulty values must update the matching
spec section — including its `Status:` line — in the same commit. When spec and
code disagree and the spec section says `implemented`, the **code wins**: fix
the spec first, then proceed. This rule is mirrored in `CLAUDE.md`.
