# Tests

These run the **real** simulation code (`js/`) so balance and fairness are
checked against the actual engine, not a reimplementation.

## Balance (no dependencies)

```
node test/headless.js     # unit-matchup balance & a mirror-match fairness check
node test/campaign.js     # every campaign level vs a one-click auto-arrayed army
```

`headless.js` loads the pure-simulation modules under a stubbed DOM and runs many
battles across multiple seeds, reporting win-rates and survivor counts. A
*mirror match* (identical armies, mirrored positions) should be roughly a
coin-flip — that's the canary for an unfair, order-dependent simulation.

`campaign.js` plays each scenario with a budget-constrained "standard army"
(mimicking the in-game **Auto-Array** button) to confirm every level is winnable
with sensible play while the later ones stay challenging.

## Integration (optional, needs Playwright)

```
npm i -D playwright && npx playwright install chromium
node test/smoke.mjs
```

Loads the actual game in a headless browser, drives it through
title → deploy → battle, and fails on any console/runtime error.
