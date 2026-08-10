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
| `test/headless.mjs` | §11.2–11.6 + poster parity + distance rule + leaderboard logic (109 checks) |
| `test/geometry.mjs` | Ports on real coastline, no sailed leg crossing land (8 checks) |
| `test/fleet.mjs` | Secondary validation against the observed fleet, ±15% (`npm run test:fleet`) |
| `test/smoke.mjs` | §11.1 + §11.7 + §11.8: stubbed Three.js/DOM boot → plan → simulate → playback → results → save → share (22 checks) |
| `tools/calibrate.mjs` | Prints the calibration table and canonical breakdown |
| `tools/shots.mjs` | Playtest screenshots driven through the real page in Chromium (`shots/`, gitignored) |
| `tools/decompose_fleet.mjs` | Attributes the fleet-check error to distance, speed-mix or power terms |

```
npm test              # headless + smoke + geometry
npm run test:fleet    # secondary: the 28 observed charters
npm run calibrate     # parity table, distance rule, canonical breakdown
```

## Calibration (spec §6)

Constants live in `DATA.calibration`: knot bins ≤ 1 kt are station-keeping,
hotel utilisation 0.635 on the guest loads, propulsion factor 0.69 on brake
power. Scoring distance follows the distance model below
(`DATA.distanceBasis: 'corrected'`), never the raw great-circle matrix. Four of the
seven published poster routes reconcile within ±1 MWh from first principles
(SOF_BLUE, BALEARICS, GREECE, TURKEY); the other three are irreconcilable by
any distance/duration model (near-identical nm/days, published figures 15 MWh
apart) and output their published figure via the §6 exact-match override,
logged.

The §5 worked example reproduces the canonical multiplier of **6.2** exactly. The
base is scored on a 0–50 board scale (a 0–100 energy frame mapped by
`outputScale`), so the canonical charter lands on **base 39 × 6.2 = 241.8**.

## Diesel reserve

Diesel is a **finite, depletable energy reserve**, not an unlimited fallback.
`DATA.dieselReserveMwh` is **251.4 MWh** — the published 4,500 nm range
expressed as energy through the same model everything else uses: 431.8 h at
the Typical cruise of 10.42 kt, propulsion 479 kW plus hotel 103 kW.

Resources deplete in order. The 50 MWh battery goes first; only once it is
spent do the diesels wake and start drawing the reserve down by **actual
generator energy**, so a fast week burns it faster per mile than the nominal
range implies. A clean week never touches it.

The penalty scales with **depth into the reserve** rather than per MWh:

```
penalty = maxPenalty x (1 - exp(-(f / depthScale) ^ exponent))    f = dieselMwh / reserve
```

A megawatt-hour past the battery costs **0.36** of the hundred-point energy
frame — you clipped it, and the score barely notices. By 24.5 MWh it costs
61.2; by 68 MWh (the deepest a single week can reach) it costs 126.5, which
drives the base well below zero. `maxPenalty` is deliberately twice the
discipline weight so an emptied reserve is worse than merely losing all
discipline. There is **no hard fail and no route-stop** — a doomed week still
runs, still completes what it can, and still scores.

The reserve is **hidden** during planning and through the battery phase of
playback. It appears in the title block at the moment the diesels wake — the
same moment the smoke starts — and the results sheet reports the reserve used
in MWh and as a percentage.

## Pending data

Port **energy types** are now real — derived by quartile from each port's
carbon intensity. **Genoa** carries no carbon figure in the source, so its
`energy` is `null` and it scores neutral on the recharge factor; the team is
to confirm a value.

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

Current state: **6 of 8** multi-charter group cells pass. The two misses are
SoF→Italy Intense (−20.9%) and Greece Intense (−15.8%). The fleet-wide
propulsion mean also reads −23.7% against a hotel mean of +4.0% — but that
headline is misleading about the cause, as the decomposition below shows.

### Known limitation: the two failing Intense cells

Documented and deliberate, not an open bug — and **not the propulsion curve or
the speed profiles**, both of which the decomposition clears. Reproduce with
`node tools/decompose_fleet.mjs`.

Against these charters' own speed mixes the shipped Intense profile is accurate
to −1.0% / −0.1% on effective speed, and runs at or *above* their actual power
(818 bkW actual vs 868 applied on SoF→Italy; 882 vs 868 on Greece).
Substituting each charter's own mix moves the cells by +0.2 and +0.0 MWh/7d.
Hotel load is accurate to +0.8% / +2.0%. Two things are actually wrong:

**1. A fleet-reference data defect — the larger term.** Each route group stores
one `distNm` but separate durations and MWh per profile, and the Typical and
Intense charters did not sail the same distance. SoF→Italy stores 387.6 nm,
exactly its Typical members' mean, while its Intense members ran 528.1
(−26.6%); Greece stores 399.2 against Intense members who ran 459.9 (−13.2%).

| | observed | as shipped | + real distance | + own mix | + own power |
|---|---|---|---|---|---|
| SoF→Italy Intense | 43.7 | −20.9% | −8.9% | −8.4% | −11.1% |
| Greece Intense | 46.7 | −15.8% | −9.6% | −9.5% | −8.7% |

Distance closes 12.0 of the 20.9 points on the first and 6.2 of the 15.8 on the
second. But `distNm` reconciles with the filed charters on **no basis** — across
ten groups it matches the Typical mean on two, the Intense mean on none, the
all-charter mean on none (Sicily/Italy stores 537.1 against members who ran
286.5). So it cannot be repaired here: substituting per-profile means fixes both
failures and breaks two cells that currently pass, for a net of nothing.

**2. A residual −9 to −11% from `propFactor`.** With the members' own distance,
speed and power the cells still sit at −11.1% and −8.7%. That is the conversion
constant: `propFactor` is fitted at **0.69** to hit poster parity, against an
observed median of **0.93** (observed propulsion MWh ÷ own bkW × own underway
hours). The collision is between `propFactor` and §6 parity — not between the
prop curve and reality.

Two caveats mean 0.93 is **not** a recalibration target: the spread across the
28 charters is **0.53 to 1.20**, and 7 charters imply a factor **above 1.0**,
which is physically impossible for brake power to electrical output. Some
observed `propulsion_mwh` therefore includes load this model books separately —
manoeuvring, DP, station keeping — so the two quantities are not measuring the
same thing.

No model constant changes on this evidence; the calibration stands. Three
questions go back to the source: per-profile group distances, what `distNm`
measures, and what `propulsion_mwh` includes.

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

Current state: **6 of 8** multi-charter group cells pass. The two misses are
SoF→Italy Intense (−20.9%) and Greece Intense (−15.8%). The fleet-wide
propulsion mean also reads −23.7% against a hotel mean of +4.0% — but that
headline is misleading about the cause, as the decomposition below shows.

### Known limitation: the propulsion bias

This is documented and deliberate, not an open bug. The disagreement is inside
the source data: the shipped speed profiles come from the pack's
distance-share distributions and imply **694 / 868 bkW** (Typical / Intense),
while the fleet reference's own per-knot underway **hours**, for the same 28
charters, imply **852 / 1152**. Two irreconcilable propulsion figures for the
same vessels.

Re-deriving the profiles from the hours was evaluated in full and rejected:

| | current | re-derived |
|---|---|---|
| §6 poster parity reconciled | **4/7** | 0/7 (all on override) |
| fleet cells passing (n≥2) | 6/8 | 7/8 |
| fleet propulsion mean | −23.7% | −2.0% |
| Sardinia & Corsica Typical (n=5) | +7.8% | **+21.0%** |
| diesel-dash balance scenario | 159.6 | **8.4** (band floor 75) |

It trades a contractual, demo-critical parity target and the balance design
for one secondary check, and moves the fleet error rather than removing it.
The inconsistency is referred back to the source. If the hours basis is
confirmed authoritative, the correction is a change to `speedProfiles.distShare`
plus a re-cut of the balance bands — and the parity table gets re-reported
honestly, not tuned back.
