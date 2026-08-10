# Design

<!-- impeccable:design-schema 1 -->

## World

**Payment slip + Pera connect.** Cool white settlement surface, black primary actions, hairline rules, zoned fields like a QR-bill. Not cream paper, not teal SaaS, not purple glow.

## Color strategy

Restrained. Neutrals + one accent.

| Token | Value | Role |
|---|---|---|
| `--bg` | `#F4F5F7` | Cool silver ground |
| `--surface` | `#FFFFFF` | Slip / modal surface |
| `--ink` | `#0A0A0A` | Primary type / CTAs |
| `--muted` | `#6B7280` | Secondary |
| `--line` | `#E5E7EB` | Hairlines |
| `--signal` | `#2563EB` | Registration accent (links, focus, live) |
| `--ok` | `#059669` | Success only |
| `--danger` | `#DC2626` | Errors only |

## Typography

- Display / UI: **Schibsted Grotesk** (variable)
- Data / addresses / codes: **JetBrains Mono**
- Radius: soft structural — `12px`–`16px` surfaces, `999px` buttons only
- No serif. No Inter / Outfit / DM Sans / Space Grotesk / Geist

## Components

- Floating island nav (detached pill), not full-bleed sticky bar glued edge-to-edge
- Double-bezel shells for major interactive panels
- Black pill CTAs (Pera-like); ghost = hairline border
- Cards only for interactive task containers (demo, forms)

## Motion

- Ease: `cubic-bezier(0.32, 0.72, 0, 1)`
- Hero: one staged rise; sections: light whileInView fade-up
- Prefer transform/opacity only

## Modes

- Landing: Persuade
- `/demo`, `/refer`, `/go`, `/register`, `/ledger`: Operate (same tokens)
