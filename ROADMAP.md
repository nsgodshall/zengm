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

**Status: scheduling and tables done.** Playoffs and the league table page stay with Epics 3 and 6 (see "Still open").

What landed:

- **Per-Division round robins** (`competition/worldSchedule.ts`): `getRoundRobinRounds` builds one round robin with the circle method. Every pair meets once, each club plays at most once a round (one club rests each round when a Division has an odd number), and home/away is balanced to within one game (exactly even with an odd number of clubs). `getDivisionRounds` repeats round robins with home and away swapped each time, so a season of 2 × (clubs − 1) games is a soccer double round robin. Leftover games come from the start of another round robin: exact with an even number of clubs, but with an odd number the clubs resting in those extra rounds end up a game short.
- **One World calendar** (`mergeRoundsIntoDays`): the Division with the most rounds plays every day, and shorter Divisions are spread evenly over the same days, so every Division starts on the first day and finishes on the last.
- **Season length per Division:** optional `Division.numGames`, falling back to the league-wide `numGames`. There's no separate games-per-opponent setting, since a double round robin is just `numGames` = 2 × (clubs − 1). Divisions also get optional `winPoints`/`tiePoints`/`lossPoints` for their table.
- **Wired in** (`season/newSchedule.ts`): a World with more than one Division uses `newWorldSchedule`, with the trade deadline and All-Star Game placed between days. Single-Division leagues keep the upstream generator untouched, including football's real schedules. The schedule callers pass `divisionId`, and new-league setup skips the `numGamesDiv`/`numGamesConf` check, which doesn't apply.
- **Tables** (`competition/divisionTables.ts`): `getDivisionTables(season)` builds one table per Division from each club's regular season record, with points for/against (every sport's team stats have `pts`/`oppPts`) standing in for goals. In a multi-Division World, the standings page ranks each Division by its table.
- **Sport-specific pacing:** `newWorldSchedule` takes an optional `pacing` hook applied to the finished calendar, so the generator itself has no `isSport` checks. No sport needs a hook yet.

Still open:

- Playoffs in a multi-Division World still follow ZenGM's conference-based playoff settings. Epic 3 decides per-Division playoffs, or none.
- A Division without its own `numGames` inherits the league-wide setting, which is 82 for basketball. Epic 7's pilot content should set each Division's season length.
- The calendar only guarantees a club never plays twice in a day. Nothing yet prevents long runs of home or away games, or the same two clubs meeting back to back where one round robin ends and the next begins.

### Epic 3 — Season flow & promotion/relegation engine

**Status: season end written and unit tested, not yet played through in the game.** See "Still open".

What landed:

- **No ZenGM playoffs in a multi-Division World:** new Worlds start with no playoff rounds, so the playoffs phase passes with no games, and the standings page opens on the Division view.
- **Champions** (`competition/endOfSeason.ts`, run at the start of `newPhaseBeforeDraft`): each Division's table winner is its champion. A top-tier champion is its Country's champion, marked the same way as ZenGM's champion in a league with no playoffs (`playoffRoundsWon` 0), so its players get the championship award and it shows in league history. Lower-tier champions get a news item.
- **Promotion playoffs** (`promotionPlayoff.ts`, `playPromotionPlayoffGame.ts`): a knockout among a link's playoff clubs in table order, with the best remaining seed at home against the worst, and byes for the top seeds when the field doesn't divide evenly. Each game is a single `GameSim` run with nothing saved (no box score, stats, or injuries), and a tie sends the better seed through.
- **Promotion and relegation** (`planEndOfSeason.ts`): every link is resolved from the final tables, and each moving club gets its team's `divisionId` (and mirrored `cid`/`did`) changed. This season's team season keeps the Division the club actually played in, and `newPhasePreseason` copies next season's from the team, so next season's schedule uses the new Divisions. Moves show up in the news feed with new `promotion` and `relegation` event types.
- **Tiebreakers** (`computeDivisionTable`): points, then point differential, then head-to-head points among the clubs still level (a mini-table of just their games, from the season's head-to-head records), then points scored, then wins.

Still open:

- Several full seasons now run through the real game code in Epic 8's integration test (`src/test/worldSeasons.test.ts`), but nobody has played a World through the UI yet.
- Promotion playoff games have scores and a bracket (Epic 6), but no box scores or player stats.
- ZenGM's awards (MVP, All-League, and so on) still treat the whole World as one league, and conference-level awards are per Country.
- The season summary page still describes a single league champion (Epic 6).
- The settings page can still turn ZenGM's playoffs back on for a World, which would bracket clubs from different tiers together again.

### Epic 4 — Transfer market & wages (replacing the draft and salary cap)

**Status: stages A (the AI transfer market), B (wage budgets and market wages), and C (the user in the market) done, and stage D (season-long loans).**

Approach: ZenGM already has settings for no draft (`draftType: "freeAgents"`, which turns each draft class into free agents) and no salary cap (`salaryCapType: "none"`). A World turns those on when it's created rather than deleting the draft and cap code, which keeps upstream merges clean (see the Epic 0 merge rule).

Stage A, landed:

- **World settings:** new Worlds start with no draft and no salary cap.
- **Transfer windows** (`competition/transferMarket.ts`): the summer window runs from the end of the season through the preseason, and the winter window is the last 15% of the regular season before the trade deadline. The user's trade proposals are refused outside a window.
- **Transfer fees:** the player's market wage (from `player.genContract`) for each season left on his contract, up to 4, adjusted for age so young players cost more. A player in the last offseason of his contract can't be bought; he becomes a free agent instead.
- **Wage budgets:** the salary cap scaled by the club's revenue last season against the league average (or by market size, before a club has a completed season), kept between half and double the cap.
- **AI transfers** (`competition/aiTransfers.ts`): in a World, ZenGM's daily AI trades are replaced by transfer attempts whenever a window is open. A club buys only if the player makes it better (by the same value calculation AI trades use), it can pay the fee (going into debt down to half its wage budget), and his wages fit its budget. The seller only sells a player it can do without. The fee moves cash between the clubs, and transfers show up in the news, on the transactions page, and in each player's transactions.
- **Tested:** unit tests for windows, fees, and budgets, and the multi-season World test checks that transfers happen, and only in phases with a window.

Stage B, landed. Decided: the wage budget is a limit set by the club's board, with the same rules as ZenGM's soft cap so play feels like the cap system, and wages are set by the market with only a minimum contract.

- **Board limit:** in a World, a club's wage budget stands in for the salary cap. Signing a free agent above the minimum contract is refused if it would take payroll over budget, both for the user (with a message from the board) and for AI clubs. Minimum contracts and re-signing a club's own players are still allowed, as with a soft cap. A trade can't increase a club's payroll past its budget.
- **Market wages** (`competition/wageBudgets.ts`): there's no maximum contract, only the minimum. The ceiling on what a player can ask for or be offered is the most any club could ever afford (twice the salary cap), and in the free agent auction each club bids with what's left of its own wage budget. `maxContract` still sets the scale of ZenGM's contract formula, so wages don't inflate across the board. The auction only runs in basketball; the other sports still price contracts with that formula, capped at `maxContract`.
- **First budgets:** starting rosters aren't built to any budget, so clubs used to start over theirs. A club's payroll is recorded when its World is created (`startingPayroll`, set by `competition.setUpNewWorld`), and until its first season is over its wage budget is at least that plus 10% of the cap. After that, budgets follow revenue again, so clubs have to trim.

Stage C, buying, landed. Decided: the user offers a fee against the club's asking price, the player keeps his contract, AI clubs will send the user offers for their players, and transfers replace ZenGM's trades in a World.

- **Asking price** (`competition/transferMarket.ts`): the player's fee, raised by 10% of it for each point of value his club would lose beyond the 5 it can do without (the same threshold AI clubs sell at), up to 3 times the fee.
- **Offers** (`competition/userTransfers.ts`): an offer at or above the asking price is accepted and paid, one of at least 70% gets a counter-offer at the asking price, and the rest are turned down. A club only hears a below-price offer for each player once a day, but the asking price can always be paid. The same limits as AI transfers apply: a free roster spot, the seller above the minimum roster, wages within the board's budget, and debt down to half the wage budget.
- **No trades in a World:** trade proposals are refused (except in God Mode), and the Trade, Trading Block, and Trade Proposals menu links are hidden.
- **Tested:** unit tests for the asking price, offer responses, the debt limit, and contract seasons left. The World test buys a player after a lowball offer is turned down and a second one the same day is refused, and checks the fee moves between the clubs.

Stage C, selling, landed.

- **AI offers** (`competition/aiOffers.ts`): once a day while a window is open, alongside AI transfers (so on regular season and free agency days), AI clubs attempt about 0.5 offers for each user club, scaled by the AI trades setting. A club only offers for a player who'd make it better, and whom it can afford and fit in its roster and wage budget. The user gets a notification, and each offer stays open for 3 days. All offers are withdrawn when the window closes, and none are made while the AI runs the user's clubs.
- **Transfer list:** a listed player is 5 times as likely to draw an offer, at 75–100% of his fee. An unlisted player draws offers at 90–120% of it.
- **Accepting** checks the buyer's roster, budget, and cash again, and withdraws an offer the club can no longer follow through on. A sold player keeps his contract, and his offers and listing are cleared.
- **Academy players** (`competition/academyTransfers.ts`): other clubs' academy players can be bought while a window is open, and join the buying club's academy, so only its cash limits it, not its roster or wage budget. With no contract to buy out, an academy player's fee is one season of his market wage above the minimum (`getAcademyTransferFee`; his value counts potential heavily), and at least a minimum contract. A club asks double for the most valuable player in its academy. He can't be sold once his club has decided on him in the summer he has to leave. The Transfer Market lists other clubs' academy players with the summer each has to leave. AI clubs buy from each other too, about 1 attempt for every 40 clubs a day, but only a player who'd be one of the 3 most valuable in their academy, at the asking price. A bought player keeps his graduation season, and the transfer is in the news and his transactions like any other. AI clubs also make offers for the user's academy players, on the same terms, with a quarter as many daily attempts as for first-team players (0.125 for each user club), and the user's academy players have their own table on the Transfer Market with offers and the transfer list.
- **Stage D, loans between AI clubs** (`competition/loans.ts`, `competition/loanMoves.ts`): decided, season-long loans with no fee, where the borrowing club pays the wages, AI clubs lend out young players who aren't getting minutes, and the player goes back in the summer. A player on loan is at the borrowing club (his `tid`), which plays him and pays him through its payroll, with a new `loan` on the player saying which club he goes back to and when. A loan made before the playoffs are over ends that summer, and one made in the summer lasts through the next season. Loans end in the draft phase, before re-signing, so the player's own club can re-sign him, and his contract has to last until then. While a window is open, about 1 loan is attempted for every 20 AI clubs a day. An AI club lends out a player 23 or younger who's outside its rotation (its best 10 players on current ability, like academy promotions) if it keeps more than the minimum roster, and borrows only a player who'd be in its rotation, with room on its roster and in its wage budget. A player on loan can't be transferred or loaned again, isn't released when an AI club cuts its roster, and goes back to his club if the user releases him. When loans end, an AI club over the roster limit releases its lowest value players, as after academy promotions. Loans and returns are in the news and the player's transactions, and the roster page's Acquired column now describes transfers and loans.
- **Stage D, the user's loans:** on the Transfer Market, Borrow on another club's player asks to borrow him until the summer, for no fee. The club agrees on the same terms it lends to AI clubs (23 or younger, outside its rotation, keeping more than the minimum roster), and the user needs room on their roster and in their wage budget. The user's players have a loan list next to the transfer list: while a window is open, AI clubs make about 0.25 attempts a day for each user club to ask to borrow a listed player who'd be in their rotation. A request shows with the transfer offers as "Loan", stays open 3 days, and Accept loans him out. Players the user has out on loan are listed with their club and the season they come back after, and a player page says who a player on loan belongs to. The roster and wage budget limits are checked again on accepting, and a request the club can't follow through on is withdrawn.
- **No trade buttons:** in a World, the Trade for and Trade away buttons on roster and player pages, the Trade With column on League Finances, and the Saved Trades menu link are hidden, since trades are refused. Players are bought on the Transfer Market instead.
- **Tested:** unit tests for offer fees and expiry. The World test accepts and rejects offers, lists and unlists a player, and checks that AI clubs only make well-formed offers for the user's players.

Still to do:

- **Loaning academy players:** only first-team players can go on loan.
- **Loans and roster limits:** in the World test's 3 auto-played seasons (24 clubs), AI clubs made no loans at all, against 29 transfers. With ZenGM's basketball roster limits of 10 to 15, a club needs 11 or more players to lend and 14 or fewer to borrow, and AI rosters are almost always at 15 while a window is open (promotions and free agency fill them). The rules work when rosters have room, which the World test sets up directly. Decided: Worlds get bigger rosters (see Epic 7). With an 18-player limit, the same test had 3 loans in 3 seasons, all during free agency and all returned on time, against 33 transfers. That's still few, so the lending and borrowing rules may need loosening once the user's side of loans exists.
- **Tuning:** the AI's thresholds (the buyer must improve; the seller can't lose more than 5 value) and the fee formula are first guesses. In the multi-season World test (24 clubs, 10-game seasons) they gave about 10 transfers a season, averaging about $24M, with the biggest at $122M against a $150M salary cap. Almost all happened during free agency, the only offseason phase with days to simulate. The winter window only lasts a day or two in a season that short, and saw 1 transfer in 3 seasons. Check volume and fees again with real season lengths. Clubs also start with only $10M cash, which limits early spending.

### Epic 5 — Youth academies (replacing the draft prospect pool)

**Status: academies, the AI running them, the user's academy screen (Epic 6), and buying and selling academy players (Epic 4 stage C) done.** Loans (Epic 4 stage D) are still to do.

Decided: every club has its own academy squad, separate from the first team. How good a club's academy is comes from its scouting budget, plus a bonus for being in a higher tier. Every club gets about the same number of prospects. A graduate signs for the minimum wage for 3 seasons.

What landed:

- **No draft classes:** in a World, `draft.genPlayers` does nothing, and a new World skips ZenGM's draft prospects, so young players only come through academies.
- **Academy players** (`competition/academies.ts`) are draft prospects (`PLAYER.UNDRAFTED`) with a new `academyTid` on the player. That keeps them off first-team rosters, payrolls, and games, and lists them on the draft scouting page by the season they have to graduate. Unlike draft prospects, they develop every preseason. They join at 16 and leave in the summer they turn 22 (3 years below the bottom of `draftAges`, up to its top), so an academy holds 6 yearly intakes.
- **Intake** (`competition/youthAcademy.ts`): each summer the World takes in as many 16-year-olds as a default draft class (56 for 24 clubs), and every club gets the same number, give or take one. They're shared out in rounds: each round, clubs take the best prospect left (by true potential) in order of academy strength plus luck. Strength is the scouting budget's effect (3-season average expense level, about −1.1 to 1.1) minus 0.5 for each tier below the top, and luck is up to ±0.75. A new World, or a World from before academies, gets all 6 intakes at once, developed to their ages.
- **Promotion**, in the draft phase before re-signing: an AI club promotes a younger academy player early only if, on current ratings (`valueNoPot`), he'd already be in its rotation: its best 10 players, twice the players on court. Promising players who aren't ready yet stay in the academy. At graduation it's keep him or lose him: the club keeps a graduate worth more than its worst first-team player counting potential (`value`), or any graduate while it's below the minimum roster size. If that takes it over the roster limit, it releases its lowest value players straight away. Graduates nobody promotes become free agents when re-signing starts, like ZenGM's undrafted prospects. A promoted player signs a rookie contract, so he can be released for free until the regular season, and the promotion shows in the news and his transactions.
- **The user's club:** the AI never decides for it. The user promotes and releases academy players on the academy page (Epic 6), and graduates they haven't decided on by the start of free agency become free agents. Auto play and spectator mode run the user's academy the way the AI runs its own.
- **Tested:** unit tests for academy ages, intake size and sharing out, strength, promotion decisions, and contracts. The multi-season World test checks that every club has an academy of the right ages that develops every season, the newest intake is shared out equally, there are no draft classes, and promotions show up in transactions and the news.

Decisions:

- Promotions never fill a roster just because there's space, and an AI club gets back under the roster limit as soon as it promotes, instead of leaving that to `team.checkRosterSizes` before the regular season. AI transfers need a buyer below the roster limit, so rosters kept full all summer shut the transfer market. In the World test, before academies, AI rosters went into the preseason with 10–14 players and there were about 9 transfers a season. Filling spare places with graduates took rosters to 13–19 and cut transfers to 2–5.
- A club's roster for promotion decisions includes players whose contracts are about to expire, since it might re-sign them.
- The bar for early promotion is the rotation, on current ability. ZenGM's player value counts potential so heavily that most teenage prospects are worth more than a club's worst first-team player, and even on current ability most beat the 15th man. Judged either way, clubs promoted 150–200 academy players in the World test's first summer, and about 2 each every summer after.

Still open:

- The draft scouting page still lists every club's academy players together, though it's no longer linked in a World.
- **Loaning academy players** (Epic 4 stage D). Academy players can be bought and sold (see Epic 4).
- **Tuning academy fees:** market wages are capped at the maximum contract, so the best few dozen prospects all cost the same (about $48.8M with a $50M maximum). First-team fees share that cap.
- Clubs only make academy decisions in the summer.
- Academy players develop at the default coaching level, not their club's.
- An expansion club has no academy until the next summer's intake.
- **Tuning:** the promotion rules, the tier penalty, and the luck in sharing out intakes are first guesses. In the World test (24 clubs, 10-game seasons), clubs promoted about 40 academy players a season, roughly half early and half at graduation, out of an intake of 56. The first summer had about 110, because a new World's full academies still hold every ready player in their older intakes; seeding them smaller could smooth that out. Transfers stayed about where they were before academies (7, 13, and 6 in 3 seasons, against 10, 3, and 13), but AI rosters go into the preseason with 13–19 players instead of 10–14, since promoted players add to them. Academies ended up with 8–16 players each.

### Epic 6 — UI/UX rework

**Status: league tables, the academy screen, the transfer market, World results, and club and country identity for the pilot World (Epic 7), with generated crests, done.**

Decided: soccer-style tables, every Division on one page grouped by Country with a Country filter, and the user's Division first. On the academy screen, the user decides on their graduates during re-signing, and promoting onto a full roster is allowed, like a draft pick.

What landed:

- **League tables** (`ui/components/LeagueTable.tsx`, from `competition/worldTables.ts`): in a World the Standings page becomes League Tables, one table per Division: position, club, P, W, D (only once a game has been drawn), L, points for and against, difference, points, and form over the last 5 games. A colored bar on each position shows what it leads to at the end of the season (`getTableZones`: promotion, promotion playoff, relegation), and (C) marks the champion once the regular season is over. The user's Division comes first, then the rest of their Country, then the other Countries, each by tier (`orderDivisionsForDisplay`), and a filter shows one Country. The season picker still works; ZenGM's league/conference/division picker is hidden.
- **Dashboard:** the mini standings show the user's Division table, with its zones.
- **Academy screen** (`ui/views/Academy.tsx`, `worker/views/academy.ts`, under Team → Academy): any club's academy players with position, age, ratings (fuzzed by the user's scouting, like draft prospects), and the summer each has to leave, plus how the academy ranks for strength. On the user's own club, Promote moves a player to the first team on the academy contract, and Release makes him a free agent. Promoting onto a full roster is allowed; the user has to release someone before the next game, as with a draft pick.
- **Graduates:** the summer academy step leaves the user's graduates in the academy and sends a notification. Re-signing no longer turns academy players into free agents or deletes them, so the user decides during re-signing, and graduates still in the academy when free agency starts become free agents (`releaseUndecidedGraduates`). Auto play and spectator mode still run the user's academy like the AI's.
- **World-only menu items:** menu links can be marked `world`, and the top menu, sidebar, and command palette hide them outside a World. `competitionDivisions` is now synced to the UI for this. Links marked `world: false` are hidden inside a World instead.
- **Transfer Market** (`ui/views/TransferMarket.tsx`, `worker/views/transferMarket.ts`, under Players, in place of Trade): open offers for the user's players, with Accept and Reject; the user's own players, each with a button for the transfer list; and every player at another club with his club, Division, contract, and fee at market value. Make offer asks for a fee in millions and shows the club's answer, with a button to pay the asking price after a counter-offer. The page also shows whether a window is open, and the user's cash, payroll, wage budget, and roster spots.
- **Promotion playoff results:** each game's score is saved for the season (`promotionPlayoffResults`, a game attribute, so no database migration), without box scores or player stats, and gets a news item. In a World the Playoffs page becomes Promotion Playoffs (`competition/promotionPlayoffBrackets.ts`, `ui/components/PromotionPlayoffs.tsx`): each playoff's clubs by seed before it's played, and its games round by round with scores after.
- **ZenGM holdovers hidden** (from playtest notes): in a World the Draft menu link and the draft pages in the command palette are hidden, a team's links leave out Draft Picks, and a player page drops College and Draft. It names the academy a player is in (and the summer he leaves) or graduated from instead, and an academy player's team line and quick links menu are his academy rather than "Draft Prospect" and his draft class. The New World team picker groups clubs by Division and shows the picked club's Division.
- **Academy on the team page** (from playtest notes): in a World, a club's links include Academy, and its team page shows how many players its academy has and its best prospect, with ratings fuzzed by the user's scouting (`competition.getAcademySummary`), linking to the academy page.
- **League on the team page** (from playtest notes): a World club's team page names its Division, Country, and tier, with its position in the Division table once it's played ("3rd of 16 in the Spanish First Division (Spain, tier 1)"), linking to the league tables, in place of ZenGM's place in its conference (`competition.getClubDivisionInfo`).
- **League history chart** (`ui/views/TeamHistory/LeagueHistoryChart.tsx`, `competition/leagueHistory.ts`, `competition/pyramidPositions.ts`): a club's history page shows its place in its Country's pyramid every season it has played, like the charts on soccer clubs' Wikipedia pages: its position in its Division after every club in the tiers above, so 1 is the top of the top tier, over shaded bands for each tier named after its Division. Promotions and relegations show as the line crossing bands. A season still being played is a hollow point, and hovering a point shows the Division and position. Positions come from each season's Division tables, since team seasons keep the Division a club played in.
- **Daily Schedule:** in a World, a day's games are grouped under Division headings, the user's Division first (`competition/scheduleDivisions.ts`). Every Division already plays on the same calendar, so this is the World calendar.
- **Tested:** unit tests for zones, form, and Division order. The multi-season World test checks the tables against the season's results, the number of places in each zone against the links, and that the user's Division comes first.

Still open for league tables:

- Not yet looked at in a browser. The dev server's game worker is shared by every tab, so testing a World there switches whatever league is open in other tabs.
- Zones show places, not results: after the season, a table doesn't mark which clubs actually went up or down, or who won the promotion playoff.
- Countries have no flags: `CountryFlag` only knows real country names.
- A "favorites" view showing just the Divisions of followed clubs.

Still to do:

- Club/country identity: flags, kit colors, and naming conventions appropriate to soccer club culture rather than NBA franchise conventions.
- The Daily Schedule's filter still calls its choices conferences, though in a World they're Countries.

### Epic 7 — Content for the MVP pilot (2 countries × 2 tiers)

**Status: the pilot World can be created from the New League page.**

Decided: real countries (England and Spain) with fictional clubs, soccer-style club names, 2 tiers of 16 clubs in each Country, and a World option on the New League page.

What landed:

- **Pilot World** (`competition/pilotWorld.ts`): England and Spain, each with a First and a Second Division of 16 clubs playing 30-game double round robins. In each Country the bottom 3 of the top tier go down, the top 2 of the second tier go up, and 3rd–6th play off for one more place. Clubs get generated names (English towns with United, City, Athletic and so on; Spanish towns with CF or FC, sometimes after Real, Atlético, or similar), three letter abbreviations, kit colors, and market sizes. Top-tier clubs are bigger, and the biggest few much bigger than the rest, so there are traditional big clubs. Countries use their real flags, since `CountryFlag` knows England and Spain.
- **New League → World** (`/new_league/world`, also on the dashboard and in the command palette): the page lists the pilot World's clubs to pick from, and creates the league with its competition structure (passed like a league file's game attributes) and random players. Customizing the teams is hidden, since editing them would break the structure.
- **Starting squads by tier** (`competition/startingStrength.ts`, `competition/startingSquads.ts`, from playtest notes): random players used to be shared out ignoring tiers, so second-tier clubs often started stronger than top-tier ones. Now the generated squads move between clubs as wholes, strongest first, in an order that goes by tier, then by market size within a tier (every Country's clubs on a tier together), plus some randomness (a normal spread of 0.12, where a tier is 1 and market size within a tier spans 0.8). In a simulated 64-club World, that puts a second-tier club among the top half of squads less than 2 times per World on average, and the biggest top-tier club starts among the 5 strongest on average, never below 16th. In a new pilot World in the browser, the 25 strongest squads all belonged to top-tier clubs.
- **Bigger rosters** (`competition/worldSettings.ts`): the New World page defaults to a roster limit of 18 instead of ZenGM's 15 (still adjustable in its settings), closer to a soccer squad. Like ZenGM, clubs start with 2 below the limit (16 players) and AI clubs sign free agents up to that, so there's room for loans, academy promotions, and transfers.
- **Stadiums by market** (`getStadiumCapacity`): each pilot club's stadium holds about 8,000 plus 9,000 for every million people in its market, between 10,000 and 80,000, which is about what a popular club that size draws, so big clubs earn more from tickets. ZenGM counts a new league with a stadium over its default 25,000 as God Mode, so in a World only one over 80,000 does.
- **More Countries, configurable Worlds** (`competition/worldCountries.ts`, `competition/worldTowns.ts`, `generateWorld`): decided, a World can have any of 7 Countries, chosen on the New World page: England, Spain, the USA (3 tiers), Mexico, Italy, Germany, and Japan (2 tiers each, with the same promotion and relegation rules), with 10 to 20 clubs in each Division (16 by default, with England and Spain chosen). The page shows how many clubs a World has and warns past ZenGM's 200-team limit, where it skips some slow extras (relatives for starting players, the settings page's schedule check). Each Country has its own pool of real towns, club name patterns in its style (Spanish CF and FC, American FC and SC, Mexican Club and Atlético, Italian AC, US, Virtus, and Pro, German FC, SV, Borussia, and Eintracht, Japanese FC and nicknames), and list of real clubs not to copy. Club name matching also ignores club types like AC, SV, and VfL, numbers, and punctuation. Decided: it's basketball, so the USA starts strongest, then roughly by basketball standing: Germany, Spain, Italy, Mexico, Japan, England (`startingStrengthPenalty` on the Country, 0 to 0.5 of a tier, added to getSquadOrder). American markets are 30% bigger, and Mexican and Japanese ones a bit smaller. Every Country's top tier still starts stronger than its own second tier.
- **Real towns** (`competition/pilotTowns.ts`, from playtest notes): decided, clubs are based in real towns with invented names. Each Country has a pool of about 60 real towns with rough populations and their English Wikipedia articles, and a World picks 32 of them, bigger towns more likely (by the square root of population), with bigger towns leaning towards the top tier (populations jittered by up to 30% when ordering). Club names are generated as before, but a name that matches a real club is skipped (`isRealClubName`, comparing without accents, capitals, and words like CF, FC, "de", and "la"), so there's no Stoke City or Real Zaragoza. That list covers professional clubs and some well-known others, and can't cover every amateur club. A club's team page shows its town and country, with links to Wikipedia and Google Maps (`Team.location`, optional, so no migration).
- **Club crests** (`competition/crests.ts`): every pilot club gets a generated crest, a shield in its kit colors with one of five patterns (plain, stripes, a band, a sash, or halves) and its abbreviation, stored as an SVG data URL in the team's `imgURL`, so it shows wherever ZenGM shows team logos.
- **Mostly local players** (`competition/nationality.ts`, `competition/localPlayers.ts`): about 70% of each club's starting players, and of its share of every academy intake, are from its Country, picked at random and given a name, birthplace, college, and face from ZenGM's name data for it. The share rounds up or down at random, so a club's one or two prospects a year still average 70%. The rest of its players, and every free agent, come from ZenGM's usual worldwide mix. A Country with no names in ZenGM's name data keeps the worldwide mix.
- **Tested:** unit tests for the structure (valid, 16 clubs per Division, the promotion and relegation rules), unique club names and abbreviations, bigger top-tier clubs, the same World from the same random numbers, and the local share. An integration test (`src/test/pilotWorld.test.ts`) creates the pilot World and starts its first season: 16 clubs in each Division, double round robins, first wage budgets that cover payrolls, academies, and 60–90% of first-team and academy players from their club's Country. Tests use a stub of ZenGM's name data with no English names, so the test also checks that English clubs keep the worldwide mix.

Decided: about 70% of a club's starting players and academy intakes are from its Country. Worlds have bigger rosters than ZenGM, to leave room for loans, and stadiums sized by market. Starting squads go by tier, then by market size, with a little randomness. Clubs are in real towns, with invented names that don't copy real clubs.

Still open:

- Worlds created before bigger rosters and stadiums keep ZenGM's roster limit and default stadiums.
- Worlds created before crests have no club logos, and ones created before real towns keep their invented towns, with no location on team pages.
- The multi-season World test still uses its small 2×2×6 World for speed, so a full pilot-sized season hasn't been run in tests.

### Epic 8 — Testing & QA

**Status: automated tests for Epics 1–3 done.** The manual playtest waits for Epic 4.

- Unit tests for the schedule generator (done: `competition/worldSchedule.test.ts`, `season/newSchedule.test.ts`).
- Unit tests for promotion/relegation, tables, and season end (done: `resolvePromotionRelegation.test.ts`, `computeDivisionTable.test.ts`, `promotionPlayoff.test.ts`, `planEndOfSeason.test.ts` in `competition/`).
- Integration test (done: `src/test/worldSeasons.test.ts`): creates a 2-country × 2-tier World of 24 clubs under Node, using fake-indexeddb, and auto plays 3 full seasons through the real game code: schedule, games, season end, academies, and free agency. It checks that every Division keeps its 6 clubs with `cid`/`did` mirroring it, every club plays exactly its 10 games and only against its own Division, each Country's top-tier table winner is its champion, exactly the right clubs move each summer (including a promotion playoff winner from 2nd–5th), and the moves are in the news. It also checks AI transfers (Epic 4) and youth academies (Epic 5). It runs in about 20 seconds as part of `node --run test`, and fails if the season-end moves are skipped.
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

- Should tie-break in a Division table use point differential, or is there a natural basketball analog to "goal difference" worth inventing (e.g. margin of victory capped per game, to avoid blowout-farming)? **Decided in Epic 3:** uncapped point differential, then head-to-head, then points scored. Revisit capping if blowout-farming shows up in playtests.
- Do lower-tier Divisions need conferences/groups for travel/regionality (real lower-division football often splits into North/South groups), or is that a later-epic concern once we scale past 2 tiers?
- How many clubs per Division for the pilot — real English football uses 20 (Tier 1) / 24 (Tier 2); worth matching or picking a rounder number for early testing (e.g. 16) to keep sim time down?
