# LEIP — Best Week of Charter · Visual Direction
*Companion to the game spec (§8). One page. The build follows this exactly; anything not covered defaults to restraint. This file updates in place as the style evolves — the repo always shows current truth.*

**Implementation rule:** every value on this page (colours, tints, fonts, line weights, foam style, HUD dimensions) lives in a single **THEME block** in the code, beside the DATA block. Game logic references theme tokens only — never raw values. The art style must be changeable by editing that one block.

---

## North star

**A serene sculptural world sailing across a working chart.**
Two layers, two languages, never blended:

- **The WORLD layer** — sea, coastline, ports, yacht — speaks the language of sculptural isometric puzzle games (Monument Valley as the touchstone): flat-shaded matte geometry, soft atmospheric colour fields, small vessel in a big calm world, quiet wonder.
- **The CHART layer** — route, graticule, annotations, HUD — speaks the language of Lateral's drawing office: precise ink linework, monospace data, engineering-drawing conventions.

The world is beautiful; the chart is true. Every element belongs to exactly one layer.

## Colour — atmosphere by time of day

The whole scene bathes in one tint at a time; the week cycles through them continuously. Flat colour and soft two-stop gradients only — no texture, no photography.

| Scene | Sea field | Sky/backdrop | Land masses |
|---|---|---|---|
| Dawn | `#8FB8B2` | `#EFC3AC` | `#E0A995` |
| Day | `#6FB5AF` | `#BFE3DC` | `#EAD9BC` |
| Dusk | `#5E8FA3` | `#E58F7B` | `#C77E6E` |
| Night | `#22345C` | `#141F3D` | `#2C3B60` |

**Ink** (chart layer): deep `#22344A` on light scenes, pale `#E8EEF2` at night — flips as one, always legible, never tinted.
**VOLT `#F5D90A`** — the single accent, constant across all scenes, ≤ 10 % of any screen, meaning *energy only*: battery gauge, inked route, mode indicator, charge markers, earned achievement dots. (High-voltage yellow deliberately — reads as one glowing object in a calm field, exactly how sculptural games use their accents, and clear of the EV-green cliché.)
**Diesel**: smoke grey `#8A8578`; signal red `#C4442A` appears only on the results screen.

## The world

- **Sea**: flat colour field with crisp white geometric foam along coastlines and in the yacht's wake — stylised strokes, never particles or transparency tricks.
- **Coastline & land**: sculptural flat-shaded masses, low-poly, stepped like carved terraces — silhouette over detail.
- **Ports**: each a *tiny sculptural landmark* rising from the chart — a lighthouse, a citadel, Monaco's terraced towers, Santorini's caldera rim — one small monument per port, readable at a glance, no clutter around it.
- **The yacht**: matte white flat-shaded hull, fine teak deck line, small against the world. No gloss, no PBR. The one moving thing.
- **Light**: single soft direction, gentle face-shading (three tones per mass: lit / mid / shade). No cast shadows, no bloom.

## The chart layer

Drawn *onto* the sea field in ink: light graticule with lat/long marginalia, sparse soundings numerals near coasts, one quiet compass rose, thin hatched coastline edge where land meets sea.

**Signature element — the passage plot.** The route is hand-plotted navigation: thin dashed rhumb lines between ports, waypoint ticks, mono bearing/distance annotations (`054° · 21 nm`). As the yacht sails, the line inks over in volt — the charter draws itself across the world.

## Typography

- **Saira SemiCondensed** — UI, labels, running text; port names in spaced caps (`P O R T O F I N O`), sea areas in italic.
- **OCR-A** — the data voice: every number and short data label (knots, MWh, %, nm, coordinates, bearings, the score). Never for sentences or UI copy — it is charismatic in readouts and illegible in prose.
Delivery: embed a **freely-licensed OCR-A digitization** as a subset woff2 in the repo (`@font-face`, fallback `monospace`). Do not rely on system "OCR A Extended" (Monotype-licensed, absent on Mac/mobile); the build must verify the license of the file it embeds.
Nothing above 600 weight. The world is the display face.

## HUD — the title block

One corner panel styled as an engineering-drawing title block: thin ruled cells, small-caps labels, mono values (MODE · SPEED · BATTERY · DAY · LEG). No cards, no glass, no shadows. Achievements: nine ink-outlined dots, filling volt when earned.

## Motion

Calm, linear, unhurried — the Monument Valley temperament. Scene tints crossfade slowly through the day cycle. The yacht glides; the wake strokes follow. Diesel smoke is a faint grey wisp — the only particle in the game. Results assemble like a drawing being stamped: rules draw in, numbers count up. Respect reduced-motion.

## Never

Bloom, glow, or neon gradients · glassy cards and drop shadows · photographic water or sky · texture maps · teardrop map pins · cast shadows or ambient occlusion showpieces · emoji or icon noise · more than one accent colour · volt on anything that isn't energy · detail for detail's sake — when in doubt, remove.
