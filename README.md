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
| `test/headless.mjs` | §11.2–11.6 + poster parity + leaderboard logic (73 checks) |
| `test/smoke.mjs` | §11.1 + §11.7 + §11.8: stubbed Three.js/DOM boot → plan → simulate → playback → results → save → share (22 checks) |
| `tools/calibrate.mjs` | Prints the calibration table and canonical breakdown |

```
node test/headless.mjs && node test/smoke.mjs
node tools/calibrate.mjs
```

## Calibration (spec §6)

Constants live in `DATA.calibration`: knot bins ≤ 1 kt are station-keeping,
hotel utilisation 0.66 on the 183/158 ekW guest loads, propulsion factors
0.68 (Typical) / 0.90 (Intense) on brake power. Four of the seven published
poster routes reconcile within ±1 MWh from first principles (SOF_BLUE,
BALEARICS, GREECE, TURKEY); the other three are irreconcilable by any
distance/duration model (near-identical nm/days, published figures 15 MWh
apart) and output their published figure via the §6 exact-match override,
logged. Every n≥2 reference route group lands within 10%.

The §5 worked example reproduces the canonical multiplier of **6.2** exactly. The
base is scored on a 0–50 board scale (a 0–100 energy frame mapped by
`outputScale`), so the canonical charter lands on **base 39 × 6.2 = 241.8**.

## Pending data

Port **energy types, charge scores and tags** (Ports tab yellow columns) are
clearly marked placeholders in the DATA block; everything else is real.
