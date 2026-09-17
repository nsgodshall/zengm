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

**Status: next.**

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

- Form demand from the clubs that can realistically sign a player, grouped by
  country, tier, role, age, and current interest.
- Let demands fall when the relevant market passes on a player.
- Model competing interest and playing-time expectations.
- Replace hard tuning constants with observable market outcomes where
  possible.

## 3. Infrastructure and finances

- Turn capital spending into persistent academy, training, medical, scouting,
  arena, and commercial assets.
- Separate wages, transfers, operations, capital projects, debt, and owner
  funding in the club ledger.
- Add multi-season projections, interest, and controlled promotion spending.
- Make every cash sink produce a visible sporting or commercial benefit.

## 4. Player development

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

## 6–9. Competition and presentation features

- Domestic elimination cups spanning every tier in a country.
- International qualification and club competition for top-tier teams.
- Contract options, bonuses, clauses, installments, sell-on percentages, and
  loan-to-buy agreements.
- Scouting knowledge by country and player exposure.
- Persistent club identities, ownership styles, rivalries, records, movement
  timelines, academy lineages, and transfer histories.

## Engineering rules

- Keep planning logic pure and unit tested, with thin database adapters.
- Apply World-only behavior at narrow call sites.
- Do not bump the league database version.
- Record balance decisions and completed validation in `ROADMAP.md`.
- Use the long-run harness for economy changes and retain compact historical
  data rather than detailed old box scores.
