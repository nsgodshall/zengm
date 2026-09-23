# World Club Overhaul Plan

This plan turns the World from a collection of promotion, transfer, academy,
and finance features into one connected club-management simulation. Each phase
should land as a tested, playable slice. Normal single-Division ZenGM leagues
must keep their upstream behavior.

## Priorities

1. Unified AI club squad planner
2. Local player and wage markets
3. Persistent infrastructure and a full financial ledger
4. Playing-time-driven player development
5. Promotion and relegation adaptation
6. Domestic cups
7. International club competition
8. Structured contracts, negotiations, and scouting knowledge
9. Deeper club history and identity

## 1. Unified AI club squad planner

### Goal

Give every club one plan that its renewals, free-agent signings, transfers,
loans, and academy decisions all follow. The planner should build a complete
rotation within the club's means instead of letting each market make isolated
decisions.

### Phase 1: shared squad snapshot

**Status: implemented.** The pure planner is now used by free agency, AI
renewals, user negotiations, and international talent-pool recruitment.

- Build a pure `ClubSquadPlan` from roster values, roster limits, rotation
  size, wage budget, and minimum wage.
- Record the target squad size, open places, wage reserve, role slots, current
  role occupancy, and the quality cutoff for each role.
- Evaluate a potential signing once and return his intended role, contract
  ceiling, and whether he improves that role.
- Route free agency, AI renewals, user negotiations, and international
  talent-pool recruitment through this shared plan.
- Keep the current contract behavior during this refactor, then tune it from
  long-run evidence.

### Phase 2: summer action list

**Status: implemented.** Clubs now classify every player, order their summer
needs, reserve minimum wages for unresolved roster places, avoid expensive
nonessential renewals, and receive minimum-contract upgrades in fair rounds
with lower tiers choosing first.

- Mark players as core, retain, available for transfer, loan, or release.
- Generate ordered needs: fill the minimum roster, repair the rotation,
  improve weak starters, then add prospects and depth.
- Reserve wages for unresolved higher-priority needs before making an offer.
- Stop renewing depth players when doing so blocks a needed starter.
- Make minimum-contract upgrades in fair rounds so one club cannot consume the
  whole useful free-agent pool.

### Phase 3: use the plan in every player-movement system

**Status: implemented.** Transfers now expose only planned surplus and recruit
for an actual squad need. Loans require a development-loan action from the
lender and a rotation place at the borrower. Academy graduates use the same
role fit before the club recruits externally. Existing team strategy and board
objectives choose whether recruitment favors potential or current ability,
without adding persistent fields.

- AI transfers buy for a recorded need and sell from recorded surplus.
- Loan borrowers target a real rotation opening; lenders protect required
  depth and use loans for development.
- Academy promotions compete with external recruitment for the same role.
- Rebuilds favor youth and potential; promotion pushes favor current ability.
- Persist only small strategy fields when needed. Rebuild the detailed plan
  from current state rather than adding a database migration.

### Phase 4: multi-season strategy

**Status: implemented.** Clubs now rebuild a pure strategy snapshot from their
tier, just-finished tier, board objective, existing team strategy, squad age,
cash, wage budget, and contracts. It identifies recent promotion or relegation,
classifies the club as title challenge, promotion push, survival, balanced, or
rebuild, and projects committed roster and payroll through the next two
summers. Free agency, renewals, transfers, academies, and talent-pool
recruitment use the result to favor current ability, potential, or a blend and
to reject expensive deals that crowd out a future complete squad. Competitive
plans may use only 2–5% controlled future overage, financially pressured clubs
get none, rebuilds keep a buffer, and modest deals up to two minimum salaries
remain available. Meaningful new roles carry a one-season playing-time promise
that AI lineups honor with a small preference.

- Derive strategy from tier, board objective, squad age, finances, and recent
  promotion or relegation: title challenge, promotion push, survival,
  balanced, or rebuild.
- Give promoted clubs a survival recruitment plan and relegated clubs a choice
  between an immediate return and a reset.
- Project expiring contracts and future payroll at least two summers ahead.
- Let strategy change offer thresholds, age preferences, acceptable debt, and
  playing-time promises without overriding the board's financial limits.

### Validation

- Unit-test plan construction and player evaluation.
- Keep every lower-tier roster at 14 or more players.
- Reduce top-three contract concentration and payroll-budget gaps.
- Keep lower-tier strength stable after the starting-payroll transition.
- Preserve a meaningful top-tier talent advantage.
- Re-run promotion survival by champion and playoff winner after every major
  squad-planning change.

## 2. Local player and wage markets

**Status: implemented.** World wage normalization now builds demand from the
same squad plans used by actual signings. A club enters a player's market only
when it has a vacancy or a genuine upgrade, can afford the contract and the
role-specific ceiling, and can offer the playing-time status implied by the
asking wage. Each interest keeps its Country, tier, role, age group, and squad
need; current bid counts then raise or lower the demand. Rebuilding and
competitive clubs rank potential and current ability differently, and close
decisions favor local players without preventing international recruitment.
The upstream single-Division market and starting-squad contract generation are
unchanged.

- Form demand from the clubs that can realistically sign a player, grouped by
  country, tier, role, age, and current interest.
- Let demands fall when the relevant market passes on a player.
- Model competing interest and playing-time expectations.
- Replace hard tuning constants with observable market outcomes where
  possible.

## 3. Infrastructure and finances

**Status: implemented.** Every World club now carries optional persistent
academy, training, medical, scouting, stadium, and commercial assets initialized
from its existing operation. AI capital spending raises the weakest assets
first, records the exact allocation, expands the stadium, and produces durable
sporting or commercial benefits above the neutral baseline. Team seasons keep
a compact ledger for wages and operations through the existing accounts plus
transfer fees, capital projects, debt interest, owner funding, prize money,
opening debt, and controlled promotion spending. Debt costs 5% annually;
exceptional owner support applies only beyond two seasons of revenue in debt.
The Team Finances page shows assets, ledger rows, and a three-season projection.
All fields are optional and filled lazily, so existing Worlds need no database
migration.

- Turn capital spending into persistent academy, training, medical, scouting,
  arena, and commercial assets.
- Separate wages, transfers, operations, capital projects, debt, and owner
  funding in the club ledger.
- Add multi-season projections, interest, and controlled promotion spending.
- Make every cash sink produce a visible sporting or commercial benefit.

## 4. Player development

**Status: implemented.** World preseason development now scales ZenGM's normal
rating changes from the player's actual appearances, competition tier, training
and medical infrastructure, fulfilled playing-time promise, and loan outcome.
Every player has a stable standard, early, late, or stalled curve derived from
his existing identity, so old saves need no migration. A completed loan carries
its borrower and the player's pre-loan playing-time share into development; the
latest compact development result records minutes, multiplier, rating change,
and playing-time gain for the long-run harness without accumulating another
history table. Academy players receive their club's training benefit without a
false no-minutes penalty.

- Connect development to playing time, role, coaching, facilities, loans,
  injuries, morale, and competition level.
- Give prospects distinct development curves, including late bloomers and
  stalled prospects.
- Measure whether loans actually increase minutes and development.

## 5. Promotion and relegation adaptation

- Recalculate plans immediately after a club changes tier.
- Add promotion wage increases, relegation reductions, and release clauses.
- Consider limited parachute payments only after the squad planner and
  contract clauses are measured.

## 6. Domestic cups

- Add one annual elimination cup spanning every tier in each country.
- Fit cup rounds around the Division schedule without giving a club two games
  on one day.
- Record cup draws, results, winners, prize money, and club history.

## 7. Champions League

**Implementation status:** the playable competition engine and its main
presentation are complete. It
qualifies clubs from final domestic tables, draws and schedules persisted group
and knockout rounds alongside promotion playoffs, validates saved state, uses a
neutral-site final, updates rolling Country coefficients, and pays every award
through the World finance ledger. World Tournaments shows qualification, live
group tables and matchdays, knockout results, prize totals, coefficients, and
past winners. Schedule cards and box scores retain their competition, club
history and team records count finals and titles, and same-season appearances
cup-tie a player after a transfer. Remaining work is richer news and dashboard
placement, deeper records, and long-run concentration tuning.

### Goal

Add one annual inter-country club tournament that crowns a World champion and
creates meaningful sporting and financial rewards without replacing domestic
titles. It must use playable scheduled games, survive reloads between rounds,
and work with any World containing two to seven Countries.

### Qualification and field

- Qualify from the current season's top-tier tables after the domestic regular
  season. Every Country gets its champion and runner-up.
- Use an 8-club field for two to four Countries and a 16-club field for five to
  seven Countries. Give remaining places to the next domestic finishers from
  the highest five-season Country coefficients.
- Begin coefficients equally. Break first-season ties deterministically by
  `countryId`; after that, score Champions League wins and advancement over a
  rolling five seasons. Never use hidden club ratings to award a place.
- If a Country cannot supply its allocation, pass the place to the next
  eligible club by coefficient and league finish. A club can qualify only once.

### Tournament format

- Draw four-club groups, keeping clubs from the same Country apart wherever
  the field permits. Play a double round robin: six matchdays per club.
- Advance the top two in each group. Rank by points, point differential, points
  scored, head-to-head result, then domestic seed.
- Play a seeded single-game knockout bracket: group winners host runners-up in
  the first round, the better surviving seed hosts later rounds, and the final
  uses a neutral site. A knockout tie advances the better seed in sports that
  allow tied games.
- Run the tournament in the playoffs phase after domestic tables are final.
  Schedule Champions League and promotion-playoff games on the same round days
  because their top-tier and lower-tier entrants cannot overlap.

### State and scheduling

- Add optional `championsLeagueState` and compact historical results to game
  attributes, following the resumable promotion-playoff pattern. Do not bump
  the league database version.
- Store entrants, domestic seeds, groups, tables, knockout seeds, completed
  games, and scheduled game IDs. Validate saved state rather than rebuilding a
  different draw after reload.
- Add one scheduler that merges a Champions League matchday with the active
  promotion-playoff round and proves that no club appears twice on a day.
- Mark each scheduled game through tournament state so the game loop can route
  its result to the correct competition. Keep domestic table records fixed.

### Money and squad rules

- Pay a modest entry award, win/draw awards, round bonuses, and a champion
  prize. Record every payment as Champions League prize money in the financial
  ledger and tune the total below a typical top-tier national-TV season so the
  tournament does not create runaway dynasties.
- Use the club's current first-team roster. A player transferred after appearing
  in the tournament is cup-tied for its remaining matches that season; store
  only the season and competition on the player and clear it naturally next
  year.
- Pay normal wages, attendance, and game operating costs. The neutral final
  splits gate revenue between both clubs.

### Presentation and history

- Add a Champions League page with qualification places, group tables, bracket,
  schedule, results, prize totals, and past winners.
- Label games in Daily Schedule, box scores, team schedules, news, and the
  dashboard. Show qualification and elimination events and a distinct trophy
  in club history.
- Add World records for titles, final appearances, longest winning run, biggest
  win, and all-time club and Country coefficients.

### Validation

- Pure tests cover slot allocation, coefficient ordering, protected group
  draws, table tiebreakers, knockout seeding, byes/fallbacks, and invalid saved
  state.
- Integration tests play every scheduled round, reload between rounds, confirm
  that domestic records do not change, and verify prize-ledger entries and the
  next season's rolling coefficients.
- Five- and twenty-season Worlds check qualification diversity, title
  concentration, added games, injuries, prize inflation, cash concentration,
  and effects on domestic promotion survival.

## 8. Contracts and scouting

- Add contract options, bonuses, clauses, installments, sell-on percentages,
  and loan-to-buy agreements.
- Add scouting knowledge by country and player exposure.

## 9. Club history and identity

- Add persistent ownership styles, rivalries, records, movement timelines,
  academy lineages, and transfer histories.

## Engineering rules

- Keep planning logic pure and unit tested, with thin database adapters.
- Apply World-only behavior at narrow call sites.
- Do not bump the league database version.
- Record balance decisions and completed validation in `ROADMAP.md`.
- Use the long-run harness for economy changes and retain compact historical
  data rather than detailed old box scores.
