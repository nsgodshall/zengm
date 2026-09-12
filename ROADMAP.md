# International Soccer Zen GM — Roadmap

Working title for a mod of [ZenGM](https://github.com/zengm-games/zengm) (the shared engine behind BBGM/FBGM/ZGMH/ZGMB). The sport stays basketball — `GameSim.basketball`, positions, ratings, and box scores are untouched — but the _competition structure_ is rebuilt from the ground up to look like world club football: many countries, each running its own multi-tier league pyramid, with promotion and relegation between tiers, and a transfer-market economy instead of the NBA-style draft/salary-cap system.

Decisions locked in for planning purposes (revisit any of these later):

- **Team-building model:** full soccer-style redesign — transfer market/scouting replaces the draft, wage budgets replace the hard salary cap, youth academies replace draft prospects.
- **MVP scope:** a small pilot — 2 countries, 2 tiers each, with promotion/relegation working end to end between a country's own tier 1 and tier 2. Everything is architected so a 3rd, 4th, 5th... country is just data, not new code.
- **Continental competitions** (a Champions League analog): explicitly out of MVP scope. The data model below leaves a clean extension point (see Epic 9) but no continental-cup code ships in the pilot.
- **The competition engine is sport-agnostic.** `Country`/`Division`/`Club`/`PromotionRelegationLink`, the per-Division scheduler, and the promotion/relegation resolver (Epics 1–3) carry zero basketball-specific assumptions and are built the same way ZenGM already shares `GameAttributesLeague` across its sports — so the same engine could drive a "many countries + promotion/relegation" mod of the football, hockey, or baseball flavor too. Only the _economy_ layer (transfer market, wages, academies — Epics 4–5) is specific to this basketball-as-soccer mod; a different sport's mod could keep that sport's existing draft/cap and still plug into the same competition engine.

## Terminology

To avoid colliding with ZenGM's existing vocabulary (where "league" means the whole save file / game world), this plan uses:

- **World** — one save file. Contains many Countries.
- **Country** — a nation. Has a name, a flag, and one league pyramid (an ordered list of Divisions by tier).
- **Division** — one tier of one country's pyramid (e.g. "England Tier 1", "England Tier 2"). This is the actual competition: a set of Clubs that play a round-robin schedule and produce a table. This is what "simultaneous top leagues" means — every country's Tier 1 Division runs concurrently in the same season.
- **Club** — what ZenGM currently calls a "team." Belongs to exactly one Division at a time; changes Division only via promotion/relegation.
- **Promotion/Relegation Link** — a rule binding two Divisions in the same Country's pyramid one tier apart: how many clubs go up, how many go down, and whether a promotion playoff exists among the near-miss clubs.

## Current architecture, in brief (from the audit of the upstream repo)

- The engine already supports multiple sports via a build-time `SPORT` env var (`tools/lib/getSport.ts`), with per-sport constants/types/GameSim (`GameSim.basketball`, `constants.basketball.ts`, `types.basketball.ts`, etc.). We build on the basketball variant and don't touch GameSim.
- Competition structure today is flat and singular: `GameAttributesLeague` (`src/common/types.ts`) holds one global `confs`/`divs` array for the _entire_ save. A team's `cid`/`did` just place it in one conference/division within that single flat league. There is no concept of more than one independent competition per save, and no promotion/relegation.
- Schedule generation (`src/worker/core/season/newScheduleGood.ts`) round-robins all teams against each other with div/conf-weighted game counts, driven off that single global `divs` array — it has no notion of "these 18 teams and those 20 teams are separate competitions that should never play each other."
- Season flow (`src/worker/core/phase/*`) is a single state machine per save: preseason → regular season → playoffs → draft → free agency → repeat. Draft (`src/worker/core/draft/*`), contract negotiation with a hard cap (`src/worker/core/contractNegotiation/*`), and free agency (`src/worker/core/freeAgents/*`) are all singular, global systems tied to that one league.
- League creation (`src/worker/core/league/create/*`) bootstraps one flat set of teams into that one global conf/div structure.

None of this is set up for "N independent competitions running at once, with clubs occasionally moving between two of them." That's the actual rework.

## Epics

### Epic 0 — Fork scaffolding

- Stand up the mod as a branch/fork of upstream `zengm` (done: fork at `nsgodshall/zengm`, work on the `international-soccer-mod` branch).
- Decide build target: keep the multi-sport build system but add this as a distinct "flavor" of the basketball build (own app name/icon/manifest), so upstream basketball fixes can still be merged in later.
- Pull upstream updates periodically without losing mod-specific changes — most of GameSim, ratings, and UI chrome should stay mergeable. (Done: `upstream` remote points at `zengm-games/zengm`; update with `git fetch upstream && git merge upstream/master`.)
- **Merge-friendliness rule:** never bump `LEAGUE_DATABASE_VERSION` or add a numbered migration to `worker/db/connectLeague.ts` for mod data — upstream's next migration would collide with ours. Fill in missing mod data when a league loads instead, the way `loadGameAttributes` already does for new settings (see `ensureCompetitionStructure` in Epic 1).
- Get the existing test suite and dev server running unmodified first, as a baseline before touching anything. (Tests/typecheck: Node 24 + pnpm, then `node --run test` and `node --run lint-ts`.)

### Epic 1 — Core data model: Country, Division, Pyramid

**Status: done.** Everything is additive: nothing existing was removed, and a league with no competition structure of its own plays exactly as before.

What landed:

- **Types** (`src/common/types.ts`): `Country`, `Division`, `PromotionRelegationLink`; optional `divisionId` on `Team`/`TeamBasic`/`TeamSeason`; optional `countries`/`competitionDivisions`/`promotionRelegationLinks` on `GameAttributesLeague`.
- **Tables and promotion/relegation** (`src/worker/core/competition/`): `computeDivisionTable` and `resolvePromotionRelegation`, both pure functions. `resolvePromotionRelegation` rejects anything that would change Division sizes: a link where clubs going up ≠ clubs coming down, a table too small for the clubs a link picks, or a club picked twice (e.g. a middle-tier Division too small to send clubs both ways). `flattenPromotionRelegationMoves` requires exactly the right number of promotion playoff winners, all from that playoff.
- **Structure validation** (`competitionStructure.ts`): unique ids; every Country's tiers start at 1 with no gaps (several Divisions on one tier are allowed); links stay inside one Country and go exactly one tier apart; every club is in a Division that exists; no Division is empty or too small for its promotion/relegation rules.
- **League creation** (`createGameAttributes`): every new league gets a structure and every team a `divisionId` — the default structure if the league file or settings don't supply one. `team.generate`, `genSeasonRow`, and the team-season fallbacks in `createStream`/`teamsPlus` carry `divisionId` through. The league file JSON schema knows the new fields, and exporting "teams" includes the structure.
- **Existing saves** (`ensureCompetitionStructure`, run from `loadGameAttributes`): a save with no structure gets the default one, and teams and cached team seasons without a `divisionId` get one. No `LEAGUE_DATABASE_VERSION` bump (see the Epic 0 merge rule).
- **New teams** (`addNewTeamToExistingLeague`): expansion and re-enabled teams get a Division via `getDivisionIdForNewClub`.

Decisions:

- **Old saves and upstream league files become one Country with one tier-1 Division holding every team, and no promotion/relegation.** Their conferences/divisions are groupings inside a single competition, not tiers, so they stay as the user set them. Team seasons older than the cache's last few seasons aren't rewritten: a missing `divisionId` on a team season means "the default Division, from before this league had a structure."
- **In a World with more than one Division, `confs`/`divs` mirror the structure:** one conference per Country, one division per Division, ordered by Country then tier, and each team's `cid`/`did` follow its `divisionId`. Existing pages (standings, team pages, the current scheduler's grouping) keep working and group clubs correctly until Epics 2/3/6 read `divisionId` directly. Known gap until Epic 2: the current scheduler still has clubs play across Divisions.
- **What stays global vs per-Division:**
  - Global to the World (stays in `GameAttributesLeague`): the calendar — `season`, `phase`, `daysLeft` and the game-day clock — so every Division plays on the same days; `userTid`/`userTids`; game rules and GameSim settings; player development, ratings, and injuries; difficulty and god mode; currency.
  - Per Division (Epics 2/3 add these as optional fields on `Division`, falling back to today's global setting): season length (`numGames`), table points and tiebreakers, and whether there's an end-of-season playoff and its format (`numGamesPlayoffSeries`, byes, play-in).
  - Per link: promotion/relegation counts and the promotion playoff (already on `PromotionRelegationLink`).
  - Per club: budget and finances (already per team), and the transfer budget (Epic 4).
- **For now a Division can be the upper side of at most one link and the lower side of at most one link.** `resolvePromotionRelegation` takes each link's clubs straight off the ends of the tables, so two links sharing a Division would pick the same clubs. Regional groups feeding one Division (see the open questions) need a smarter resolver.

`divisionId` cutover plan, for Epics 2/3/6 to execute. A survey of `cid`/`did`/`confs`/`divs` found ~120 non-test files (84/85/59/51 respectively), most in `worker/views` (26), `ui/views` (12, plus `NewLeague` 5, `ManageTeams` 3, `Settings` 2), `worker/core/team` (8), `worker/core/season` (8), `common` (8), `worker/core/realRosters` (6), `worker/core/draft` (5), and `worker/core/phase`, `worker/core/awards`, and `worker/api` (4 each).

1. **Keep `divisionId` and `cid`/`did` in sync (done in Epic 1).** `divisionId` is set everywhere a team or team season is created, and the mirror keeps `cid`/`did` consistent with it.
2. **Epic 2 — scheduling and standings read `divisionId`:** `worker/core/season` (schedule generation, standings), then the standings/schedule/team views in `worker/views`.
3. **Epic 3 — season flow writes `divisionId`:** playoffs and phase changes in `worker/core/phase` and `worker/core/season`; promotion/relegation moves clubs by setting `divisionId` (and, via the mirror, `cid`/`did`); awards in `worker/core/awards` group by Division/Country instead of conference. `worker/core/draft` is retired by Epic 4 rather than converted.
4. **Epic 6 — UI:** `ui/views` (standings, `NewLeague`, `ManageTeams`, `Settings`, `ScheduleEditor`, `AwardSettings`) replaces conference/division editing with Country/Division editing. Until then, editing confs/divs in a multi-Division World breaks the mirror (`ensureValidDivsConfs` would reassign `cid`/`did` without touching `divisionId`).
5. **Finish:** make `divisionId` required on `Team`/`TeamSeason` and the structure keys required on `GameAttributesLeague`, then drop the mirror.

### Epic 2 — Schedule generation across independent competitions

- Rework `newScheduleGood.ts` to generate a schedule **per Division**, independently — a Division's clubs play a home/away round robin against only their own Division's other clubs (this is simpler than the current conf/div weighting, since soccer leagues don't nest conferences inside a division).
- Merge all Divisions' fixtures into one World-wide calendar (shared match days/weeks) so every country's Tier 1 plays out concurrently.
- Handle uneven Division sizes (a 2-country/2-tier pilot could still have different club counts per tier) and byes if a Division has an odd number of clubs.
- Update standings (`getSchedule.ts`, `getSeasonLeaders.ts`, and friends) to compute one table per Division rather than one global table.
- Parameterize games-per-opponent/season length off `GameAttributes` (as today) rather than hardcoding basketball's numbers, so the same generator works unchanged if it's ever compiled into a football/hockey/baseball flavor.
- The existing generator has exactly one sport-specific branch (`isSport("football")`, for football's real-schedule import). Don't add more scattered `isSport` checks to the new Division-based generator — isolate any sport-specific pacing quirks (e.g. hockey back-to-backs) behind a single hook/strategy function so the core per-Division round-robin logic stays sport-agnostic.

### Epic 3 — Season flow & promotion/relegation engine

- Rework `phase/newPhaseRegularSeason.ts` / `newPhasePlayoffs.ts`: for most Divisions the champion is simply the club on top of the table at season end (no playoff), matching real soccer; keep the _option_ of an end-of-season playoff for a Division (useful for promotion playoffs among clubs ranked 3rd–6th, common in real football pyramids).
- New phase step: **end-of-season promotion/relegation resolution** — after all Divisions finish, walk every `PromotionRelegationLink`, move the top N clubs of the lower Division up and bottom N of the upper Division down (running any promotion playoffs first), and reassign `divisionId` on the moved clubs before the next season's schedule is generated.
- Decide tie-break rules (goal difference / goals scored analogs using whatever basketball stats stand in, since there's no natural "goals" — likely point differential, then head-to-head).
- Surface promotion/relegation results in the season recap / news feed UI.

### Epic 4 — Transfer market & wages (replacing the draft and salary cap)

- Remove/retire the annual draft (`worker/core/draft/*`) and the hard salary cap logic (`worker/core/contractNegotiation/*` as currently written).
- Design a **transfer system**: clubs can list players, other clubs bid, a transfer fee is agreed (AI valuation model needed — likely adapted from existing trade value logic in `worker/core/trade/getPickValues.ts` and player value estimation elsewhere), and two transfer windows per season (like real soccer) gate when transfers can happen.
- Design **loans**: a club can temporarily send a player to another club (common soccer mechanic, useful for academy graduates who aren't ready for the first team).
- Replace the hard cap with a **wage budget** per club (soft constraint tied to club finances/attendance revenue, which `worker/core/finances/*` already partially models) — no max/min contract rules, market-driven wages instead.
- Free agency (`worker/core/freeAgents/*`) keeps existing out-of-contract players available to sign at any time, soccer-style, rather than a scheduled free-agency period.

### Epic 5 — Youth academies (replacing the draft prospect pool)

- Replace `draft/genPlayers.ts` (annual draft class) with a **per-club academy**: each club periodically generates a small number of young prospects into its own pool (not a shared league-wide pool), which graduate into the first-team roster or get sold/loaned out.
- Decide academy quality variance by club (bigger/richer clubs in higher divisions produce better prospects on average, smaller lower-division clubs produce more volume but lower quality) to give promotion/relegation strategic weight.

### Epic 6 — UI/UX rework

- Navigation: replace the single "standings" page with a Country → Division picker; a "World" or "favorites" view showing just the Divisions the player's club and any followed clubs are in.
- League table page: per-Division table with clear promotion/relegation zone highlighting (colors/rows), matching real football table conventions.
- Transfer market UI: replace the trade-proposal UI with a transfer market browser (list available/listed players, make offers, negotiate fees and wages).
- Club/country identity: flags, kit colors, and naming conventions appropriate to soccer club culture rather than NBA franchise conventions.
- Season calendar view spanning all countries' Divisions at once, so the player can see results across the whole World, not just their own competition.

### Epic 7 — Content for the MVP pilot (2 countries × 2 tiers)

- Pick 2 placeholder (or real-world-inspired but original) countries and name/flag them.
- Generate 2 tiers per country (e.g. 16–20 clubs each) with names, colors, stadiums, starting rosters — can lean on existing `realRosters`/`createRandomPlayers` machinery for the player pool, but club identities need new data.
- Seed initial club strength/finances so the pilot isn't perfectly flat (bigger "traditional" clubs vs smaller ones), giving promotion/relegation stories room to develop.

### Epic 8 — Testing & QA

- Unit tests for the new schedule generator (correct round robin per Division, no cross-Division fixtures, correct World-wide calendar merge).
- Unit tests for the promotion/relegation resolver (correct clubs move, ties broken correctly, playoff variant works).
- Integration test: simulate several full seasons autoplay (`worker/core/league/autoPlay.ts` as a reference) across the 2×2 pilot and confirm no crashes, no orphaned clubs, and division sizes stay correct after repeated promotion/relegation cycles.
- Manual playtest pass focused on the transfer market economy (does it produce sensible AI behavior, do wages stay plausible over a multi-season save).

### Epic 9 — Extension points for later (explicitly not in MVP)

- Continental competition data model: a competition that draws clubs from multiple countries' top Divisions (design the interfaces in Epic 1/2 so this doesn't require another data-model rewrite later — e.g. don't hard-code "a Division only ever plays its own clubs" so deeply that a cup competition can't cut across Divisions).
- Scaling from 2 countries to many: content pipeline / procedural generation for club names, so 20+ countries doesn't mean 20+ countries of hand-authored data.
- Multi-currency economics across countries (MVP should assume one unified in-game currency to avoid FX complexity; real relative purchasing power differences between countries is a later nice-to-have).
- Because the competition engine (Epics 1–3) is kept sport-agnostic, a later "many countries + promotion/relegation" mod of one of ZenGM's other sports (football, hockey, baseball) should be able to reuse it directly and only need its own Epic 4/5-equivalent (whatever team-building model fits that sport), not a second rewrite of the data model or scheduler.

## Suggested build order

1. Epic 0 (scaffolding) → Epic 1 (data model) — nothing else can start until Country/Division/promotion-relegation types exist.
2. Epic 2 (scheduling) + Epic 3 (season flow/promotion-relegation engine) together — these are tightly coupled and should be built and tested against a small hand-built fixture (e.g. 2 fake Divisions of 4 clubs each) before touching real content.
3. Epic 4 (transfer market/wages) + Epic 5 (academies) — can be built in parallel once Epic 1 is stable, since both mainly touch player/contract logic, not scheduling.
4. Epic 6 (UI) — starts as soon as Epic 2/3 produce real tables and results to display; extends as Epic 4/5 land.
5. Epic 7 (pilot content) — needed to actually playtest anything end-to-end; can start in parallel with Epic 6 once Epic 1 is stable.
6. Epic 8 (testing) — ongoing throughout, with a dedicated pass once Epics 1–7 are integrated.
7. Epic 9 — design-only during MVP; implementation deferred.

## Open questions to resolve before or during Epic 1

- Should tie-break in a Division table use point differential, or is there a natural basketball analog to "goal difference" worth inventing (e.g. margin of victory capped per game, to avoid blowout-farming)?
- Do lower-tier Divisions need conferences/groups for travel/regionality (real lower-division football often splits into North/South groups), or is that a later-epic concern once we scale past 2 tiers?
- How many clubs per Division for the pilot — real English football uses 20 (Tier 1) / 24 (Tier 2); worth matching or picking a rounder number for early testing (e.g. 16) to keep sim time down?
