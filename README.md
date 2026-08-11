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
| `test/headless.mjs` | §11.2–11.6 + poster parity + distance rule + leaderboard logic (166 checks, 1 open item — see below) |
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

**None** of the seven published poster routes now reconciles within ±1 MWh from
first principles, down from four. All seven output their published figure via
the §6 exact-match override, logged, and all seven still output their published
**nm** exactly — nothing a player sees is wrong. What is lost is first-principles
reconciliation. Reported rather than tuned away; see the open-item note printed
by `npm test`.

| route | published | before | after | |
|---|---|---|---|---|
| SOF_BLUE | 35 | 35.63 calib | 41.88 (+6.88) | override |
| SOF_GREEN | 48 | 38.21 | 49.48 (+1.48) | override |
| SARD_BLUE | 35 | 40.85 | 50.65 (+15.65) | override |
| SARD_GREEN | 50 | 43.17 | 53.60 (+3.60) | override |
| BALEARICS | 36 | 36.98 calib | 46.75 (+10.75) | override |
| GREECE | 43 | 42.54 calib | 53.34 (+10.34) | override |
| TURKEY | 38.5 | 37.52 calib | 45.44 (+6.94) | override |

Two changes took it there, both on the engineering team's own figures. Deleting
`propFactor` took parity 4/7 → 1/7; the distance-based speed regression took it
1/7 → 0/7, because poster routes are long and now run a faster mix (SOF_GREEN
went +0.65 → +1.48 MWh, just outside the window). Every route simulates **high**,
by +1.5 to +15.7 MWh — a spread no single scalar closes, over published figures
that are mutually inconsistent to begin with.

The §5 canonical worked example lands on **base 17.55 × multiplier 6.3 = 111**.
The multiplier reads the itinerary, not the energy, so every energy change lands
entirely in the base: 23.96 → 27.05 MWh on the electrical curve (base 16.08 →
17.63, final 101 → 111), then 27.05 → 26.89 MWh on the regression (base → 17.55,
final unchanged at 111).

## Speed model

The speed split is **predicted from total route distance** by linear regression
over the 28 observed charters, not fixed per toggle. The two profiles it
replaced were a single split computed at one route distance and applied to every
route regardless of length.

```
share%(v) = slopePctPerNm × routeNm + interceptPct
  14 kt:  0.0073 × nm +  6.90
  11 kt:  0.0108 × nm + 75.68
   8 kt: -0.0182 × nm + 17.40
```

The **Hare/Tortoise** toggle is one editable constant (`hareTortoisePct`, 5
points) added to the 14 kt share and mirrored on 8 kt; 11 kt is never touched,
so the toggle trades slow miles for fast miles rather than changing the cruise.
At the sheet's 71.3 nm check point this reproduces Hare 12.4/76.5/11.1 and
Tortoise 2.4/76.5/21.1 exactly.

Effective speed and average draw both move with route length:

| route nm | Tortoise | Hare |
|---|---|---|
| 71.3 | 10.24 kt / 661 kW | 10.84 kt / 803 kW |
| 440 | 10.55 kt / 722 kW | 11.18 kt / 872 kW |
| 1,039 | 11.08 kt / 829 kW | 11.45 kt / 933 kW |

Two properties of the fit are handled explicitly, and both are asserted. The
intercepts sum to 99.98 with slopes summing to −0.0001/nm, so the shares are
**renormalised to 100 after clamping** or a long route silently loses ~0.1% of
its distance. And the 8 kt share goes **negative** past 956 nm neutral / 681 nm
on Hare — distances real routes reach — so it is **clamped at zero**; beyond
that the regression is extrapolating past its observed range.

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

**Score Over 400 is clean-reachable.** Verified by optimised search — seeded
from the poster routes, hill-climbed by single-port insert/swap/delete over
55,480 route/nights combinations — not by random sampling, which misses the
optimum because uniformly-drawn routes almost never land near the battery cap.
Of 9,275 clean completions, **1,370 clear 400**; the best clean week scores
**423** (base 45.93 × 9.20, 418.6 nm, 49.995 MWh, zero diesel: Savona → Monaco
→ Nice → Saint Tropez → Antibes → Ajaccio → Monaco).

## Diesel reserve

Diesel is a **finite, depletable energy reserve**, not an unlimited fallback.
`DATA.dieselReserveMwh` is **362.1 MWh** — the published 4,500 nm range
expressed as energy through the same model everything else uses: 409.1 h at a
flat 11 kt, propulsion 771.8 kW plus hotel 113.4 kW. The basis is a flat 11 kt
rather than a profile's effective cruise because the regression makes that
cruise route-dependent, and a delivery passage is not a charter week.

At **~7× the battery** the reserve cannot deplete in a single week, and that is
intended: it is a realistic backstop, not a second resource to manage. The
scoring teeth stay the uncapped −1 point/MWh diesel penalty on the base; there
is deliberately **no reserve-depletion penalty** on top. The gauge drains on
screen once the diesels wake because that is honest and dramatic, not because
running it dry is a normal-play concern.

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

## Port energy colours

Port **energy colours** are **fixed thresholds** on grid carbon intensity —
green ≤ 150, blue ≤ 300, grey ≤ 420, brown above (gCO₂/kWh) — not relative
quartiles. That matters beyond tidiness: under quartiles a port's colour, and so
its recharge score (the heaviest multiplier factor), could change because a
*different* port was edited. A port's colour is now a property of that port
alone. The cuts give **7 green / 11 blue / 6 grey / 9 brown**.

**Genoa** was the pack's last blank and is now 488 gCO₂/kWh, brown. No unrated
ports remain, so `rechargeUnrated` is unreachable and kept only as the rule for
a future port with no figure.

### Data-pack provenance, one gap

The copy of `leip_game_data.json` in this repo is the **older** pack: it has no
`speed_model` block, still carries Genoa as `null`, and still holds the relative
`energy_colour_quartiles_gco2kwh`. The regression coefficients, the fixed
thresholds, the Genoa figure and the 362.1 MWh reserve derivation were all
supplied directly in the change request and are implemented and asserted from
those values — the DATA block is the authority here, not the JSON beside it.
Livadia's Tilos position (36.4325, 27.386) and its regenerated `leg_correction`
ratios were already ingested, from `leip_distance_model.json`. Dropping the
refreshed `leip_game_data.json` into the repo would let the build tools
cross-check the DATA block against it again.

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
The fleet-wide propulsion mean reads **+11.2%** against a hotel mean of
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
| fleet total mean | −9.9% | **+11.0%** |
| fleet propulsion mean | −23.7% | **+11.2%** |
| fleet hotel mean | +4.0% | +11.6% |
| SoF→Italy Intense | −20.9% | **−2.6% ok** |
| Greece Intense | −15.8% | **+6.1% ok** |
| SoF Typical | ok | +16.6% |
| Sardinia & Corsica Typical (n=5) | ok | +33.8% |
| Greece Typical | ok | +22.1% |
| Turkey Typical | ok | +20.7% |
| Balearics Typical | ok | +26.6% |

**1. The error sorts by profile, not by route** — every failing cell is a
**Typical** cell and every one overshoots — and that is the whole diagnosis. It
is **not** a profile that can be re-fitted away: replacing the two fixed profiles
with the distance-based regression did not move these cells, which stayed high to
within a point or two.

It is the known **source-data disagreement**. The pack ships a distance-share
distribution *and* a per-knot **hours** distribution for the same 28 charters,
and the two imply different propulsion — 694/868 kW against 852/1152. The game
is built on the distance-share side; these cells are the hours side pushing
back. Reconciling the two speed representations is for the engineers, not the
build.

Note the direction of travel: the failure **count went up while the model got
closer to reality**. Per charter, observed ÷ modelled propulsion has a median of
**0.934** and a mean of **0.908** — the curve is now about 7% heavy on the
median charter where it was roughly 31% light before. The spread is still **0.53 to 1.20**, far too
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

### The speed-representation disagreement, still open

Re-deriving the speed model from the per-knot hours instead of the distance
shares was evaluated in full and rejected: it took §6 poster parity from 4/7
reconciled to 0/7 and collapsed the diesel-dash balance scenario. That
evaluation predates both the `propFactor` deletion and the regression, and its
numbers are stale — but its conclusion is not. The source contains two
incompatible propulsion bases, and the Typical-cell overshoot above is that same
disagreement surfacing from the other side.

No model constant changes on this evidence, and the curve is **not** re-tuned
back — it is the engineering team's stated figure, used as-is. Four questions go
back to the source: per-profile group distances, what `distNm` measures, what
`propulsion_mwh` includes, and which of the two speed representations is
authoritative.
