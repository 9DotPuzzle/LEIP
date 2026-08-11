# LEIP — Best Week of Charter

Plan a one-week Mediterranean charter aboard **LEIP** — a 70 m E-Hybrid
superyacht with a 50 MWh battery and diesel backup — then watch it play out on
a sculptural nautical chart. Score = energy discipline × charter quality.

Built to [`LEIP_charter_game_spec_v2.md`](LEIP_charter_game_spec_v2.md) (v2.1)
and [`LEIP_visual_direction.md`](LEIP_visual_direction.md), both contractual.

## Play

Open [`index.html`](index.html). Single self-contained file plus one companion
font file (`fonts/leip-ocra.woff2`); Three.js via CDN is the only network
dependency. Works from `file://`, static hosting and GitHub Pages, desktop and
mobile. Without WebGL or network it degrades to a readable notice and instant
results — the math never depends on either.

## Layout

| Path | What it is |
|---|---|
| `index.html` | The game: `#leip-theme` (THEME block — every visual value), `#leip-data` (DATA block — every gameplay value), `#leip-engine` (pure scoring/simulation), `#leip-app` (world + chart + UI) |
| `leip_game_data.json` / `LEIP_game_data.xlsx` | Real engineering data pack (reports 200-52, 835-52, 320-52, port list, Charter_Routes.pptx) mirrored 1:1 into the DATA block |
| `LEIP_activities_data.xlsx` | Dataset 5 (activities), mirrored 1:1 |
| `fonts/leip-ocra.woff2` | **OCR-A LEIP** — original CC0 digitization of the ANSI X3.17 OCR-A model, built by `tools/build_ocra_font.py`. See `fonts/LICENSE-OCR-A-LEIP.txt` for the license-verification record (the common "free" OCR-A lineage carries a no-profit restriction and was rejected) |
| `fonts/LICENSE-SAIRA-OFL.txt` | Saira SemiCondensed license (embedded in the HTML as base64 by `tools/embed_fonts.mjs`) |
| `leip_distance_model.json` | Poster charter distances + per-leg sea-lane corrections (see Distance model) |
| `leip_fleet_reference.json` | 28 observed charters + route groups, the secondary external check |
| `test/headless.mjs` | §11.2–11.6 + poster parity + distance rule + leaderboard logic (156 checks, 2 open items — see below) |
| `test/geometry.mjs` | Ports on real coastline, no sailed leg crossing land (8 checks) |
| `test/fleet.mjs` | Secondary validation against the observed fleet, ±15% (`npm run test:fleet`) |
| `test/smoke.mjs` | §11.1 + §11.7 + §11.8: stubbed Three.js/DOM boot → plan → simulate → playback → results → save → share (62 checks) |
| `tools/calibrate.mjs` | Prints the calibration table and canonical breakdown |
| `tools/shots.mjs` | Playtest screenshots driven through the real page in Chromium (`shots/`, gitignored) |
| `tools/decompose_fleet.mjs` | Attributes the fleet-check error to distance, speed-mix or power terms |

```
npm test              # headless + smoke + geometry
npm run test:fleet    # secondary: the 28 observed charters
npm run calibrate     # parity table, distance rule, canonical breakdown
```

## Calibration (spec §6)

`DATA.calibration` is now a single entry — `posterToleranceMwh: 1.0`, the ±1
MWh window a poster route must land inside to count as reconciled. The
constants that used to live here are gone: `propFactor` was deleted after the
engineering team confirmed the propulsion table gives **electrical** power
(P_B GEN+Sea), and `hotelUtilisation` went with it, since hotel power is now
read straight off `DATA.hotelKw` (128.0 kW at rest / 113.4 kW under way).
Scoring distance follows the distance model below
(`DATA.distanceBasis: 'corrected'`), never the raw great-circle matrix.

**One** of the seven published poster routes now reconciles within ±1 MWh from
first principles (SOF_GREEN), down from four. The other six output their
published figure via the §6 exact-match override, logged. All seven still
output their published **nm** exactly. This is a direct consequence of removing
`propFactor` — those were the constants absorbing the gap — and is reported
rather than tuned away; see the open-items note printed by `npm test`.

| route | published | simulated | Δ | |
|---|---|---|---|---|
| SOF_BLUE | 35 | 41.99 | +6.99 | override |
| SOF_GREEN | 48 | 48.65 | +0.65 | **calibrated** |
| SARD_BLUE | 35 | 50.23 | +15.23 | override |
| SARD_GREEN | 50 | 53.07 | +3.07 | override |
| BALEARICS | 36 | 46.28 | +10.28 | override |
| GREECE | 43 | 52.71 | +9.71 | override |
| TURKEY | 38.5 | 45.34 | +6.84 | override |

The §5 canonical worked example lands on **base 17.63 × multiplier 6.3 = 111**.
The multiplier is unchanged by the curve — it reads the itinerary, not the
energy — so the whole movement from the previous 101 is in the base, and all of
that is the energy ladder (23.96 → 27.05 MWh of battery).

## Scoring (spec §5)

**Base, 0–50**, two linear ladders and a penalty, with no floor:

- **distance** — 5 points per 100 nm, capped at 25 (continuous, not stepped)
- **energy** — 5 points per 10 MWh of **battery** energy, capped at 25
- **diesel** — −1 point per MWh, uncapped

The base may go negative on heavy diesel, deliberately. Because the distance
ladder pays 5 points per 100 nm and diesel costs only 1 per MWh, buying roughly
50 nm with ~2 MWh of diesel is a net gain — a light diesel burn is a legitimate
strategy, and a heavy one is ruinous.

**Multiplier, 1.0–10.0**, a weighted average of five factors each scored 1/3/6/10
by band, with weights summing to 5:

| factor | weight | 1× | 3× | 6× | 10× |
|---|---|---|---|---|---|
| recharge energy | 1.50 | brown | grey | blue | green |
| ports visited | 1.25 | 1–3 | 4 | 5 | 6+ |
| countries | 1.00 | 1 | 2 | 3 | 4+ |
| anchor nights | 0.75 | 0–1 | 6+ | 2–3 | 4–5 |
| activity uses | 0.50 | 0–3 | 4–7 | 8–11 | 12+ |

Anchor nights is deliberately non-monotonic — six or more nights at anchor
drops back to 3× — which is why `bandLookup` takes ordered `[threshold, score]`
pairs and lets the last match win rather than assuming a rising ladder. Genoa
carries no carbon figure, so it scores as grey (3×): unrated is never a reward.

**Final = base × multiplier**, rounded, ceiling 500, and negative where the base
is. `ENGINE.computeScore` is pure — quantities in, score out, no route and no
timeline — and the four worked examples in `DATA.scoringExamples` are asserted
against it directly.

## Diesel reserve

Diesel is a **finite, depletable energy reserve**, not an unlimited fallback.
`DATA.dieselReserveMwh` is **348.6 MWh** — the published 4,500 nm range
expressed as energy through the same model everything else uses: 431.8 h at the
Typical cruise of 10.42 kt, propulsion 694 kW plus hotel 113.4 kW. (It was
251.4 MWh before the curve became electrical; the range is fixed, so a heavier
per-mile draw makes the same range cost more energy.)

Resources deplete in order. The 50 MWh battery goes first; only once it is
spent do the diesels wake and start drawing the reserve down by **actual
generator energy**, so a fast week burns it faster per mile than the nominal
range implies. A clean week never touches it.

There is **no hard fail and no route-stop** — a doomed week still runs, still
completes what it can, and still scores, however far below zero.

The reserve is **hidden** during planning and through the battery phase of
playback. It appears in the title block at the moment the diesels wake — the
same moment the smoke starts — and the results sheet reports the reserve used
in MWh and as a percentage.

## Pending data

Port **energy types** are now real — derived by quartile from each port's
carbon intensity. **Genoa** carries no carbon figure in the source, so its
`energy` is `null` and it scores **grey** (3×) on the recharge factor — the
middle band, never a reward for being unrated; the team is to confirm a value.

## Distance model

Two quantities, deliberately separated, from `leip_distance_model.json`:

- **Poster routes** are curated real charters. If the player's route is an
  exact ordered match for one of the seven sequences, the game outputs that
  route's published nm whole — no speed or activity qualifier. The sequences
  are the charters **as sailed**: repeated ports and returns to the start
  included (SOF Blue is eight stops and visits Antibes twice). The published
  figures are charter distances, and the implied factors over the passage sum
  run ×0.92 to ×2.37, so they cannot be decomposed into legs.
- **Everything else** is a planned passage, scored leg by leg as
  `matrix[a][b] × getLegCorrection(a, b)`.

`ENGINE.posterByRoute` is the single exact-ordered-match detector, shared by
the distance rule and the §6 MWh override. `ENGINE.getLegCorrection` is the
single boundary to the correction table — a test asserts the ENGINE block
references `LEIP_LEG_CORRECTION` exactly once, so replacing the table with
lanes the game computes itself is a one-function change.

## Fleet reference (secondary validation)

`DATA.fleetReference` carries the 28 observed charters from
`leip_fleet_reference.json` (Report 835-52 AIS analysis) and their route
groups. It runs on its own — `npm run test:fleet` — deliberately outside the
primary suite: it is a real-world anchor with real-world scatter, held to the
source's own ±15% band, and folding it into the primary suite would put
pressure on the contractual §6 calibration.

Current state: **3 of 8** multi-charter group cells pass, down from 6 of 8.
The fleet-wide propulsion mean reads **+10.6%** against a hotel mean of
**+11.6%**. Both numbers, and the failing cells themselves, changed when
`propFactor` was deleted — see below.

### Known limitation: the five failing Typical cells

Documented and deliberate, not an open bug. This note **replaces** an earlier
one about two failing *Intense* cells: those two are now fixed and the failure
moved wholesale to the other profile. Reproduce with
`node tools/decompose_fleet.mjs`.

What changed underneath it: the engineering team confirmed the propulsion table
gives **electrical** power (P_B GEN+Sea), not brake power, so `propFactor` was
deleted rather than retuned. Effective propulsion power rose ×1.45 and the
model went from running light to running heavy.

| | before | after |
|---|---|---|
| fleet cells passing (n≥2) | 6/8 | **3/8** |
| fleet total mean | −9.9% | **+10.5%** |
| fleet propulsion mean | −23.7% | **+10.6%** |
| fleet hotel mean | +4.0% | +11.6% |
| SoF→Italy Intense | −20.9% | **−2.3% ok** |
| Greece Intense | −15.8% | **+6.3% ok** |
| SoF Typical | ok | +16.9% |
| Sardinia & Corsica Typical (n=5) | ok | +32.7% |
| Greece Typical | ok | +20.7% |
| Turkey Typical | ok | +20.4% |
| Balearics Typical | ok | +25.4% |

**1. The error now sorts by profile, not by route.** Every failing cell is a
**Typical** cell and every one overshoots. That is a different signature from
the old failure and it points at the Typical speed profile rather than at the
curve: under electrical power the Typical mix spends too long under way, too
fast, or both, for the charters filed under it. The Intense profile lands.

Per charter, observed ÷ modelled propulsion has a median of **0.934** and a
mean of **0.908** — the curve is now about 7% heavy on the median charter where
it was roughly 31% light before. The spread is still **0.53 to 1.20**, far too
wide to read a constant off, and ratios above 1.0 still say some observed
`propulsion_mwh` includes load this model books separately (manoeuvring, DP,
station keeping). That caveat no longer rests on a brake-to-electrical
impossibility argument — there is no conversion any more — but on the spread
and on what the two figures each count.

**2. The fleet-reference data defect is unchanged** and still a real term. Each
route group stores one `distNm` but separate durations and MWh per profile, and
the Typical and Intense charters did not sail the same distance. SoF→Italy
stores 387.6 nm, exactly its Typical members' mean, while its Intense members
ran 528.1 (−26.6%); Greece stores 399.2 against Intense members who ran 459.9
(−13.2%). `distNm` reconciles with the filed charters on **no basis** — across
ten groups it matches the Typical mean on two, the Intense mean on none, the
all-charter mean on none (Sicily/Italy stores 537.1 against members who ran
286.5). Substituting per-profile means still nets nothing: 3/8 → 5/8, fixing
two cells and breaking two that pass.

### The speed-profile disagreement, still open

The shipped speed profiles come from the pack's distance-share distributions
and now imply **694 / 868 kW** (Typical / Intense) with no conversion applied,
while the fleet reference's own per-knot underway **hours**, for the same 28
charters, imply **852 / 1152**. Two irreconcilable propulsion figures for the
same vessels. Re-deriving the profiles from the hours was evaluated in full and
rejected because it took §6 poster parity from 4/7 reconciled to 0/7 and
collapsed the diesel-dash balance scenario.

That evaluation predates the `propFactor` deletion and its numbers are stale,
but its conclusion is not: the source contains two incompatible propulsion
bases, and the Typical-profile overshoot above is the same disagreement
surfacing from the other side.

No model constant changes on this evidence, and the curve is **not** re-tuned
back — it is the engineering team's stated figure, used as-is. Four questions
go back to the source: per-profile group distances, what `distNm` measures,
what `propulsion_mwh` includes, and whether the Typical speed distribution is
representative of the charters filed under it.
