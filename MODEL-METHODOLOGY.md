# Aureum Tipoff — NBA forecast methodology and limitations

## Scope
The Game Room estimates the probability that the selected home-side team wins an NBA game using information available before the selected game. It also offers separately labeled *what-if* assumptions. It does not establish that user-selected tactical or injury effects were learned from data.

## Source and regular-season boundary
Game outcomes and box-score participation come from ESPN's published NBA event feeds, which are third-party data rather than official NBA statistics. Each historic training season is audited for **1,230 games and exactly 82 games for each of the 30 teams**. The NBA Cup championship is classified separately from the regular season: the 2024–25 and 2025–26 championships have verified event IDs; the 2026–27 championship is recognized by its scheduled Eastern date and neutral venue, and explicit championship labels are supported. The championship can remain visible in the public game archive without being used as a regular-season training result. A season failing this audit cannot silently be accepted for full-season model training.

## Features and fitting
The current deployable advanced model uses six entirely historical team-difference features, plus a home-site term:
1. Rolling Elo-style rating difference.
2. Smoothed wins in the recent ten-game window.
3. Rest-day difference, capped at three days per team.
4. Smoothed recent scoring margin.
5. Previous-seven-day game count.
6. Recent opponent strength.

Ratings, form and margins update **after** all game features for that date are captured, preventing same-day results from influencing any other game's prior estimate. A new season carries a regressed rating rather than assuming unchanged rosters or season-to-season strength. The model fits a regularized logistic regression and selects a small, predefined family of feature and regularization options.

## Chronological evaluation and calibration
The model uses historical 2024–25 and 2025–26 regular-season games for training and two chronological, non-overlapping validation periods:
- Historical fold 1: 978 training games, 773 validation games.
- Historical fold 2: 1,751 training games, 613 validation games.

A limited probability-scale calibration search (0.80, 0.90, 1.00, 1.10, 1.20) is scored **only** within those historical folds. Tiny apparent calibration gains are discarded in favor of unscaled probabilities. Model selection never uses outcomes from the 2026–27 test games.

After selecting settings, the model retrains on eligible historical observations and evaluates the 2026–27 sample with only pregame features. Accuracy, Brier score and log loss are all reported. An approximate Wilson interval accompanies winner accuracy, and a seeded date-block paired bootstrap compares Brier loss against a simpler historical model. These intervals communicate uncertainty; a range containing zero for the Brier improvement is not proof of superiority.

The automatically refreshed forecast JSON contains the authoritative exact metrics. The sample from the first verified revision, before additional 2026–27 games, had 194 tested games, 71.13% retrospective winner accuracy, and Brier 0.20437. This is a **retrospective** result and must not be advertised as achieved prospective accuracy.

## Pregame prospective ledger
Scheduled games receive write-once, timestamped predictions before tipoff. Original coefficients, context date, venue, feature values, source snapshot timestamp and forecast probability are preserved; completed results may later be appended, but probabilities are not rewritten to fit the results. Accuracy on a handful of settled predictions is not statistically persuasive. The ledger must grow to a much larger number of independently recorded predictions before any practical reliability claim.

## Player assumptions and Game Room factors
Historic player box scores identify realized participation after games; they are **not** advance injury information. The experimental player-minutes model remains disabled unless it improves a separate held-out Brier test. Injury-report availability is independent of roster data, and no report is not evidence of availability. The Game Room's manually selected matchup factors remain explicitly hypothetical, not empirically validated causal adjustments. Long-range models omit unavailable future rest and schedule-load inputs rather than inventing them.

## Reproducibility
- `node tests/site.test.mjs`: web assets, datasets, Game Room logic.
- `node tests/forecast-strengthening.test.mjs`: Cup segregation, 82-game checks, chronological model selection, forecast evaluation and horizon invariants.
- `node scripts/refresh-training-history.mjs`: source/repair historical regular-season archives (network access required).
- `node scripts/train-advanced.mjs`: regenerate season-specific model JSON and prospective ledger.

Continuous integration checks the entire source tree. Snapshot refreshes occur through documented GitHub Actions. Source freshness, injury uncertainty, retrospective/prospective distinction, and sample size must remain visible.
