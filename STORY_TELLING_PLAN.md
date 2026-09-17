# World Storytelling Plan

The goal: a World that writes its own history. Over 20, 50, 100 seasons the
player should be able to read how a club climbed from the third tier to the
title, how a giant fell and spent a decade trying to get back, which club
owned an era and when that era ended, and which derbies and rivalries grew out
of it all. The story isn't scripted; the World should produce it and then
remember it, recognize it, and tell it.

That breaks into three jobs, and today the World is weak at all three:

1. **Remember:** keep a compact, durable record of what happened each season.
2. **Recognize:** detect the storylines in that record (streaks, firsts,
   droughts, climbs, collapses, rivalries, legends) and judge how much they
   matter.
3. **Tell:** show those stories where the player looks (news, the dashboard,
   club pages, a World chronicle, season previews).

A fourth job is gameplay, decided with the user on 2026-09-17: **produce** more
stories by giving the simulation long memory. Each Country's top tier should
look like a real league, with a dominant few clubs that are challenged once in
a while. Club stature drives revenue, hype, and where players want to play,
owners bring takeovers and collapses, and real clubs start with their real
history (Phase 6). None of that may break the balance the long runs have tuned.

This extends `PLAN.md` priority 9 ("Deeper club history and identity"), and
ties into priorities 3 (the finance ledger, in progress), 6 (domestic cups),
and 7 (international club competition).

## Where the World is today

### What already tells stories

- **News events** (`logEvent`): Division champions (score 20 for a top tier,
  10 below), promotion and relegation (20), each promotion playoff game,
  transfers, loans, academy promotions, talent-pool signings, youth intake day,
  and winter window reminders. Relegation news names the players freed by
  relegation clauses.
- **Season Summary** (`competition/seasonSummary.ts`, `worker/views/history.ts`):
  each Country's Divisions by tier with champion, promoted (marking playoff
  winners), relegated, and each Division's awards.
- **Club pages:** Division and table position, board objective, club facts
  (stadium, market rank, cash, transfer funds), academy summary, real town
  with Wikipedia and Maps links, and the history page's pyramid position chart
  (`competition/leagueHistory.ts`, `pyramidPositions.ts`).
- **League tables:** zones, form, (C) for champions, ▲/▼ and (P) for what
  actually happened.
- **Upstream ZenGM features that still work in a World:** Division awards (MVP,
  Top Scorer, Young Player, All-Division Team), Hall of Fame, retired jersey
  numbers (`player.checkJerseyNumberRetirement` on retirement), player feats,
  head-to-head records, transactions, owner messages, relatives, tragic deaths.
- **Identity content:** 260 real clubs across six Countries with real crests
  and towns, plus generated clubs in real towns. Many towns hold more than one
  club (New York, Tokyo, and Osaka three each; London, Manchester, Liverpool,
  Glasgow, Madrid, Barcelona, Berlin, and Hamburg among the real clubs), so
  derbies already exist in the data even though nothing names them.
- **In progress (uncommitted in the working tree):** persistent club
  infrastructure (`competition/worldInfrastructure.ts`) and a finance ledger on
  team seasons (`worldFinance`: transfer fees, capital projects, debt interest,
  owner funding, prize money, promotion spending). That is raw material for
  financial stories: a new stadium, an owner bailing a club out, debt piling
  up.

### What's missing

1. **History is recomputed, not recorded.** A club's finish in a past season is
   rebuilt every time from team seasons plus the head-to-head store
   (`getLeagueHistory` calls `getDivisionTables(season)` for every season). That
   gets slower with every season, and it's fragile: Delete Old Data's "Delete
   Old Team History" removes past team seasons, head-to-heads, and retired
   numbers, which erases a club's whole past. Nothing records streaks, biggest
   wins, points records, or who was the top scorer for a club.
2. **Upstream history pages assume one playoff league.** League History
   (`historyAll.ts`) reads `playoffSeries`, which a World doesn't have, so it
   shows no champions. Team Records (`teamRecords.ts`) counts titles from
   `playoffRoundsWon`, so it sees top-tier titles only: no lower-tier titles,
   promotions, relegations, or seasons in the top flight. Frivolities' team
   seasons (best and worst champions, oldest and youngest champions), "best
   players without a title", GOAT, Power Rankings, and Season Preview are
   league-wide rather than by Country and Division.
3. **Clubs have no identity beyond name, colors, crest, and town:** no stature,
   honours, nickname, founding year, or rivals.
4. **News has no memory.** Each item stands alone. A promotion never says "for
   the first time in club history", "back in the top flight after 12 seasons",
   or "their third promotion in four seasons". A title never says "ends a
   30-season wait" or "fifth in a row".
5. **The simulation deliberately forgets.** Hype moves a quarter of the way back
   to 0.5 every summer (`regressHype`), wage budgets follow revenue (market size
   and the Division's TV share), and the long runs counted "no club won its
   Division more than 3–5 times in 10 seasons" as a success. That's fewer
   dynasties than real football: in the ten seasons from 2010–11 to 2019–20 the
   Bundesliga had 2 champions and Serie A had 2 (Bayern won 11 in a row from
   2013, Juventus 9 from 2012), La Liga had 3, and the Premier League had 5.
   Meanwhile the tier gap is large (average team rating about 82, 40, and 32 in
   tiers 1–3 in the latest five-season run), so a climb from the third tier to
   a title is likely close to impossible. Neither has been measured as a story
   question yet. And in a World a player's own wishes only count in the user's
   negotiations and re-signings: AI free agency and every transfer ignore where
   he'd like to play, so a club's size doesn't attract anyone.
6. **Big real-world story sources don't exist:** managers, owners and takeovers,
   financial collapse, domestic cups, and continental competition.

## Principles

- **Facts, then stories, then presentation.** Record compact facts at the
  moment they happen. Detect stories from those facts with pure functions.
  Render text at display time wherever possible, so wording can improve
  without rewriting saved history.
- **Detected, never scripted.** Story detection doesn't change results. Anything
  that changes how the World plays (Phase 6) is a separate, measured decision.
- **Durable and compact.** Stories must survive Delete Old Data's box score and
  team stats options, and a club's roll of honour should survive "Delete Old
  Team History" too. Never depend on box scores surviving.
- **No database version bump.** Optional fields on existing records (`teams`,
  `teamSeasons`, `players`, `events`), filled in lazily when a World loads, the
  way `ensureCompetitionStructure` and `worldContentFilled` work. The events
  store already keeps structured entries the News page skips (`retiredList`,
  `newTeam` in `IGNORE_EVENT_TYPES`), which is a precedent for archive entries.
- **Sport-agnostic story engine.** Detectors read tables, tiers, moves, titles,
  transfers, and awards. Player stories use awards and a stat chosen by the
  sport's award settings (Top Scorer uses points today), never basketball stat
  names directly.
- **Significance is rarity.** A story's score comes from how unusual it is in
  that Country's own recorded history (the first time in 40 seasons, a new
  record, the third time ever), plus whether it involves the user's club, so
  scores scale from a 10-season World to a 100-season one.
- **One storyline, many updates.** A title streak is one storyline that grows
  ("back-to-back", "three in a row", "a record sixth") rather than a new item
  every season, and it ends with its own story ("the end of an era").
- **Cheap at runtime.** Worlds have 112–260 clubs. Detection runs over compact
  history at a few fixed moments (end of regular season, after promotion and
  relegation, transfer completions, preseason) and at most once a round for
  in-season races. Pages read saved results instead of recomputing.
- **World-only**, at narrow call sites; normal ZenGM leagues stay upstream.

## Story catalogue

What the World should be able to tell, with first-guess detection rules. Every
threshold is a named constant for the long run to tune.

### Dynasties and eras

- **Title streaks:** back-to-back, three in a row, N in a row; equals or breaks
  the Country's record run.
- **Dynasty:** 3 titles in 5 seasons (or 4 in 6). Named by its span ("Bayern
  Munich's 2031–2037 dynasty") and listed on the club and Country pages.
- **End of an era:** a dynasty club goes 2 seasons without the title, or
  finishes outside the top 3; "first season without a trophy since 2031".
- **Dominant seasons:** points record, unbeaten league season ("invincibles"),
  title clinched with the most games to spare, biggest winning margin.
- **League character:** over the last 10 and 20 seasons, how many distinct
  champions a Division has had, labeled "one-club league", "duopoly", or
  "open", for Country pages and previews.

### Rise

- **Climb:** up 2 or more tiers within 5 seasons, back-to-back promotions, or
  "from the Third Division to champions" (the Wimbledon story).
- **Firsts:** first ever promotion to the top tier, first title, first title for
  a club promoted the season before (Kaiserslautern, 1998).
- **Drought ended:** a title after 15 or more seasons without one; promotion
  back to the top flight after 10 or more seasons away.
- **Overachievers:** finishing far above the squad's preseason rank in its
  Division (`ovrStart`) or the board's target (Leicester, 2016).
- **Established:** a promoted club's fifth consecutive season in its new tier.

### Fall

- **Fallen giant:** a club in the top quarter of its Country by stature (Phase 2)
  relegated from the top tier, or dropping to the third.
- **First relegation in club history** (Hamburg, 2018), and the end of an
  ever-present top-flight record.
- **Freefall:** back-to-back relegations.
- **Yo-yo club:** 3 promotions and 3 relegations within 10 seasons.
- **Champions to relegation:** relegated within 3 seasons of a title.
- **Worst seasons:** fewest points record (Derby County's 11 points in
  2007–08).
- **Great escape:** bottom, or a set number of points from safety, at the
  season's two-thirds mark, then survives (needs the in-season snapshot from
  Phase 1).
- **Financial trouble** (after the ledger): debt past the owner-support limit,
  a forced sale of the club's best player, a board crisis.

### Races and drama, during the season

- **Title race:** the top two within one win with a quarter of the season left;
  decided on the last day; clinched with N games to spare; the contenders meet
  in the run-in.
- **Relegation battle:** the drop decided on the last day, or by tiebreak.
- **Runs:** unbeaten or winning runs of 10 or more, losing runs of 8 or more,
  winless starts.
- **Promotion playoffs:** the final between two clubs, and repeat heartbreak
  ("lose in the promotion playoffs for the third season running").

### Rivalries

- **Derbies:** clubs in the same town (`Team.location.town`), named after it
  ("the Madrid derby", "the Tokyo derby"). A Country's club data can add named
  derbies between towns later.
- **Rivalries that grow:** a rivalry score for each pair of clubs that rises
  when they finish first and second, meet in a promotion playoff, go up or down
  together, decide a title between them, or sell a star to each other, and
  decays over about 10 seasons. The strongest few for each club are its rivals.
- **Derby records:** all-time record, biggest wins, longest unbeaten runs in the
  fixture, recorded as they happen rather than read back from head-to-heads.

### People

- **Club legends:** most appearances and most points for a club, one-club
  players, academy graduates who became stars, retired numbers (already
  there), and Hall of Famers framed by club.
- **Golden generation:** 3 or more players from the same academy's intakes of
  2–3 seasons becoming first-team regulars at that club together.
- **Record transfers:** club, Country, and World record fees, a star sold to a
  rival, a player returning to his first club, an exodus from a relegated club
  (relegation clauses already free these players).
- **Careers across the World:** titles won in more than one Country, most clubs
  played for, most promotions.
- **Managers** (not being added yet): long tenures, sackings, a manager who
  takes a club up the pyramid.

### Countries and the World

- **Country strength over time:** average top-tier squad strength, and later
  continental results, to tell "the golden age of the Italian First Division".
- **Club of the decade**, player of the decade, and each Country's all-time
  greats.

## Phases

### Phase 0: measure story yield

**Status: the report is implemented; the 20-season baseline is being run.**

Before building any page, find out what stories the current simulation
produces, and how far its top tiers are from Phase 6a's targets.

- **Story yield** (`competition/storyYield.ts`, pure and unit tested): from
  every club's saved history (Phase 1), for each Country's top tier, the
  distinct champions and the most titles by one club in every run of 10
  seasons, the longest title run, dynasties (3 titles in 5 seasons), first
  titles, and the big clubs (each season's 3 clubs with the best average place
  in the pyramid over the 5 seasons before): how often 2 or more of them finish
  in the top four, their share of titles, challengers' titles, big clubs
  relegated, and the biggest club at the start and the end. For movement: climbs
  of 2 tiers within 5 seasons, clubs going from the bottom tier to the top,
  yo-yo clubs (3 promotions and 3 relegations within 10 seasons), clubs never
  out of the top tier, immediate returns after promotion and relegation, and
  how many different clubs win the lower tiers. Thresholds are in
  `STORY_YIELD_SETTINGS`.
- **The long run** writes it to `stories.md` and `stories.json` (with every
  club's history, for analyzing again offline) next to its other reports
  (`src/test/worldLongRunStories.ts`), with a table against Phase 6a's targets.
- Chronicle headlines move to Phase 3, where the news descriptions that would
  write them are built.
- Still to do: run it over 20 seasons and record the baseline in `ROADMAP.md`.

### Phase 1: remember (the club season record)

**Status: implemented,** apart from the two-thirds table snapshot, which moves
to Phase 4 with the in-season stories that need it. No gameplay change.

- **Club season record** (`competition/clubSeasonRecords.ts`, pure, and
  `competition/recordWorldSeason.ts`): when a season ends, after promotion and
  relegation, each club's team season gets `worldSeason`: its Division, Country,
  tier, position, clubs in the Division, place in the pyramid, points, record,
  point difference and points scored, whether it was champion, whether it went
  up or down, whether it won or lost a promotion playoff it played in, its
  squad's rank in the Division at its first game (`ovrStart`), whether it met its
  board objective, its top scorer (the same stat as the Division's Top Scorer
  award) and the player with the most games, both with names kept in case the
  players are deleted later, and its runs.
- **Runs:** `writeTeamStats` keeps `worldRuns` on a World club's team season as
  regular season games are played: current and longest winning, unbeaten,
  losing, and winless runs (a tie ends a winning or losing run but continues an
  unbeaten or winless one), and the biggest win and loss with the score,
  opponent, and game.
- **Club history:** the club itself gets a short entry for each season in
  `worldHistory` (Division, tier, position, clubs, pyramid place, points,
  champion, moved, promotion playoff), which Delete Old Team History doesn't
  touch. Recording a season again replaces its entry.
- **Older Worlds:** a World made before this records every finished season it
  still has team seasons for, once, when it loads (`worldSeasonRecordsFilled`,
  a game attribute, so no migration). Only team seasons still in the cache get
  full records; older seasons get their club history entries. New Worlds start
  with the flag set.
- **League history chart:** `getLeagueHistory` reads finished seasons from the
  club's history and only works out tables for a season without an entry, like
  the one being played. Tier bands come from the Country's current Divisions.
- **Tested:** unit tests for runs, leaders, records (places, moves, playoffs,
  squad ranks, objectives), and history entries. The World season test checks
  every club's record and history entry against each season's tables, summary,
  and moves, that runs and leaders fit the games played, that an older World
  gets identical histories when it loads, and that the league history chart
  reads the saved history.

### Phase 2: club identity and honours

**Status: not started.**

- **Honours** (`getClubHonours`, pure, from the records): titles by tier,
  promotions (and through playoffs), relegations, seasons in each tier, best
  finish, current top-flight run, "never relegated", dynasties, and records
  held.
- **Stature:** a slow-moving number from 0 to 100 for how big a club is, from
  titles, top finishes, and seasons in each tier with a half-life of 10–15
  seasons, plus market size. It's kept on the team with a copy in each season's
  record, so its rise and fall can be charted. Real clubs start from their real
  standing and generated clubs from their starting tier and market size (Phase
  6d). In this phase it only labels clubs "giant", "established", "yo-yo",
  "rising", "minnow", or "sleeping giant" (high stature, low tier); Phase 6b
  makes it affect hype, revenue, and players' choices.
- **Founding years and nicknames:** from Phase 6d's data, shown on the team
  page.
- **Pages:**
  - **Club honours** on the team page (trophy cabinet) and the team history
    page (roll of honour by season, eras).
  - **League History** in a World: for every season, each Country's champion
    for every tier and who went up and down, in place of the empty playoff
    view.
  - **Team Records** in a World: titles by tier, promotions, relegations,
    seasons in the top flight, best finish, and stature, instead of playoff
    columns.
  - **Roll of honour** for each Division: champions by season and titles by
    club.
- **Tested:** honours from hand-built records; the World test's honours match
  its seasons.

### Phase 3: context in the news

**Status: not started.** The cheapest big improvement, and the first use of
the saved records.

- Give existing news items their history, from pure `describe…` functions over
  the records: champions ("their first title", "back-to-back", "a record fifth
  in a row", "ends a 23-season wait"), promotion ("for the first time in club
  history", "back after 12 seasons", "a second promotion in a row"), relegation
  ("the first relegation in club history", "ending 31 seasons in the top
  flight", "a year after winning the title"), and transfers ("a club record
  fee", "a new World record", "from their rivals").
- Raise the event score for rarer versions, so they show on the dashboard and
  in the big news filter.
- **Tested:** unit tests for each description; the World test checks a
  promotion's text against the club's record.

### Phase 4: recognize (the story engine)

**Status: not started.**

- **Detectors** (`competition/stories/`): pure functions from a World history
  (club season records, structure, awards, transfer records, rivalry scores) to
  stories, each with a kind, clubs, players, Country, Division, seasons, a
  significance score, and the facts needed to phrase it. One detector per
  catalogue entry, each unit tested against hand-built histories.
- **Storylines:** a story with an ongoing subject (a streak, a dynasty, a
  rivalry, a drought) has a stable key such as `titleStreak:<tid>`. A new season
  updates it, and its end is its own story.
- **When detectors run:** after each season's records are written (dynasties,
  climbs, falls, records, legends), when a transfer completes (record fees,
  rival sales), in the preseason (storylines to watch), and once a round during
  the regular season for races and runs, with a per-Division limit so the news
  doesn't flood.
- **Saving:** stories are events of a new `story` type with a structured
  payload and text rendered from it, scored by significance. A new News
  category, Stories, filters them, and a World's own archive entries (like the
  season digest in Phase 5) use an event type the News page skips.
- **Rivalries:** the rivalry score from the catalogue, updated each season from
  the records and transfers, kept for each club's strongest few rivals on the
  team, with derbies found from towns when a World loads.
- **Tested:** detectors unit tested; the World season test checks that known
  outcomes produce their stories exactly once, and the long run reports story
  counts by kind and season (Phase 0's section, now from the real engine).

### Phase 5: tell (presentation)

**Status: not started.**

- **World Chronicle** (a World-only page): season by season, and Country by
  Country, the headline story, each Division's champion and who went up and
  down, records broken, the transfer of the season, and each Division's player
  of the season, with filters for a Country or club. A season's digest is saved
  when the season ends, so the page never recomputes old seasons.
- **Around the World** on the dashboard: the week's biggest stories from every
  Country, not just the user's Division.
- **Season Preview in a World:** for each Division, the storylines to watch:
  the champion going for another title, promoted clubs and how clubs like them
  have fared, a fallen giant trying to come back, the biggest derbies, the
  strongest squads, and the big clubs' board objectives.
- **Club history page:** the pyramid chart marked with titles, promotions,
  relegations, dynasties, and the club's biggest signings and legends; a
  stature line; an "eras" list.
- **Records** for each Country: most points, fewest points, longest unbeaten
  run, biggest win, most titles, longest top-flight run, and record transfers.
- **All-time tables:** each top tier's all-time table and seasons in the top
  flight.
- **Rivalries:** a club's rivals with their all-time record and recent
  meetings; the schedule, box scores, and game news name derbies.
- **Club legends:** on the team page, most appearances and points, one-club
  players, academy graduates, and retired numbers.
- **The user's club:** notifications when a story involves it, and board and fan
  expectations that mention history ("the fans expect a return to the top
  flight").

### Phase 6: a World that makes its own history

**Status: decided with the user (2026-09-17), not started.** Top tiers should
look like real leagues: a dominant few clubs, challenged once in a while.
Stature affects revenue, hype, and which clubs players want to join. Owners
bring takeovers, owners pulling out, and administration with points deductions.
Real clubs start with their real-world history. Managers aren't being added
yet. Every step is measured with 20-season long runs, against the targets
below and the balance already tuned (promotion survival, tier strength,
finances). Concentration has to come from stature, money, and players, never
from tilting games.

#### 6a. Targets: real-league concentration

For each Country's top tier, averaged across Countries and runs, since a
single run varies:

- **A dominant few:** 2–5 distinct champions in any 10 seasons (typically 3),
  and the most successful club wins 4–7 of 10. In most 20-season runs some
  Country has a title run of 5 or more, but no club wins all 20.
- **Big clubs stay big:** the Country's three biggest clubs by stature take at
  least two of the top four places in most seasons.
- **Challenged once in a while:** a club outside the three biggest wins the
  title once or twice every 20 seasons per Country (Wolfsburg in 2009, Atlético
  in 2014, Leicester in 2016, Napoli in 2023), and finishes second more often.
- **Eras end:** in most runs at least one Country's biggest club at the start
  isn't its biggest at the end.
- **Giants rarely fall:** a top-three club by stature is relegated about once
  per Country every 20–40 seasons.
- **Lower tiers stay open:** second-tier champions are mostly different clubs.
- **Guardrails, unchanged:** 30–47% of clubs promoted to a top tier go straight
  back down, 27–40% of relegated clubs come straight back, every roster has 14
  or more players, ratings stay flat, and lower-tier finances get no worse.

Today's tuning works against this: hype is pulled toward a flat 0.5 for every
club, and an even spread of titles was counted as a success.

#### 6b. Stature in play

- **Hype:** the summer pull (`regressHype`) goes toward a resting point set by
  stature (first guess 0.3 for the smallest clubs to 0.75 for the biggest)
  instead of 0.5, so a giant keeps its crowds through a bad season and a small
  club's excitement after a good one fades.
- **Revenue:** merchandise and sponsorship scale with stature (a big club sells
  shirts around the world), on top of market size and the commercial
  infrastructure now in progress, within bounds (first guess 0.75× to 1.75×).
  Attendance already follows hype. Wage budgets follow revenue, so bigger clubs
  can pay more without a separate rule.
- **Players want to join big clubs:**
  - A club stature component in World players' mood, next to market size, hype,
    facilities, and team performance. That covers the user's negotiations and
    re-signings, which already use mood.
  - Free agency and the local wage market (`localWageMarket.ts`, `autoSign`):
    when several clubs want a player, he chooses by wage and role weighted by
    each club's stature, so a giant can sign him for less and a small club has
    to pay more.
  - Transfers: a player won't drop far down in stature without a clear step up
    in wages or role, and a star at a club far smaller than he is can push for
    a move, which lowers his club's asking price (a "wants to leave" story).
    The Transfer Market shows the player's answer as well as the club's.
  - International talent-pool players prefer bigger clubs the same way.
- **Brakes on runaway dynasties:** stature decays, each effect is capped, the
  squad planner's roles mean a player still wants minutes (stars don't all
  stack at one club), squads age, and 6c's takeovers fund challengers. The long
  run tunes the caps toward 6a.

#### 6c. Owners, takeovers, and administration

This builds on the finance ledger in progress (`worldFinance`,
`buildWorldPreseasonFinance`), where an owner now automatically covers any debt
beyond twice a season's revenue.

- **Owners:** each club gets an owner with a generated name and a kind that
  decides how much debt it will cover, how much it puts in, and what it
  expects: a local owner (little to put in, patient), a benefactor (rich,
  ambitious, puts money in, loses patience), an investment group (wants the
  club to pay its way and sells stars at a profit), or fan ownership (never
  puts money in, very patient).
- **Takeovers:** each summer every club has a small chance of being bought
  (first guess 1–2%, so one or two a season in a 112-club World). It's higher
  for a sleeping giant (big market or stature, doing badly) or a club deep in
  debt (a rescue), and lower for a dominant club. A benefactor puts cash in for
  several seasons, which raises the wage budget above what revenue alone allows
  (up to a limit) and pays for transfers and infrastructure. That's where most
  challengers to the dominant few come from.
- **Owners pulling out:** a benefactor whose club keeps missing its objectives,
  or who runs out of money or patience, leaves. The budget falls back to
  revenue, and the big contracts have to go.
- **Administration:** when a club's debt passes what its owner will cover, it
  goes into administration: a points deduction next season (first guess a
  tenth of the most points a club could take in a season, about what real
  leagues deduct), a transfer embargo for the next window (minimum contracts
  only), its best-paid players transfer listed at reduced prices, part of the
  debt written off, and a new owner (a rescue takeover). A second
  administration within 5 seasons doubles the deduction.
- **Points deductions:** `computeDivisionTable` takes a points adjustment for
  each club (sport-agnostic), and tables show it. Promotion, relegation, board
  objectives, and stories all use the adjusted points.
- **Stories:** takeovers, owners leaving, administration, points deductions,
  and "relegated after a points deduction" all go to the story engine.

#### 6d. Real clubs' real history

- Each of the 260 real clubs gets its founding year, nickname, and a starting
  stature from its real standing: for football clubs, league titles, seasons in
  the top flight, and European trophies; for the American, Japanese, and
  Mexican clubs, their standing in their own sport (the Yankees start as
  giants). These are data files the user reviews Country by Country, like the
  club lists.
- Generated clubs get a generated founding year and a starting stature from
  their starting tier and market size.
- Older Worlds get stature seeds and founding years once when they load.

#### Later

- **Managers:** not being added yet.
- **Golden generations** (decided: yes, after 6b is measured): occasional
  exceptional academy intakes at one club, as another way for challengers to
  appear, and a story of its own.
- **Cups and continental competition** (`PLAN.md` priorities 6 and 7): giant
  killings, doubles and trebles, cross-Country rivalries, and Country
  strength.

### Phase 7: optional narrative polish

**Status: planned for later.**

- More variety in story wording from templates, with a club's nickname, derby
  names, and seasons spelled out naturally.
- Planned (decided): season reviews written by a language model from the saved
  story facts. Templates stay the default and the fallback, and the model is
  never the source of any fact.

## Data model summary

All optional, with no database version bump, and filled in when a World loads.

| Where                    | New optional data                                                      | Survives                                        |
| ------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------- |
| `TeamSeason.worldSeason` | The club season record (Phase 1), stature that season (Phase 2)        | Everything but "Delete Old Team History"        |
| `Team` history list      | One small entry per season: Division, position, outcome                | Everything                                      |
| `Team` identity          | Stature and its seed, founding year, nickname, rivals and derbies      | Everything                                      |
| `Team` owner             | Name, kind, since when, funding promised and paid                      | Everything                                      |
| `TeamSeason`             | Points deduction, administration, owner funding (in the ledger)        | Everything but "Delete Old Team History"        |
| `events` of type `story` | Structured story payload, storyline key, significance                  | Everything (Delete Old Data doesn't clear news) |
| `events` archive entries | Each season's World digest for the Chronicle, skipped by the News page | Everything                                      |
| Game attributes          | Backfill flags only                                                    | Everything                                      |

Club legends come from players' stats rows. "Delete Unnotable Player Info"
keeps award winners, but a club's appearance leaders could lose their rows, so
each season's record keeps the club's top scorer and most-used player.

Related clean-up to consider: `promotionPlayoffResults` is a game attribute that
grows every season and is loaded with the rest of them; moving finished seasons
into the events archive would keep game attributes small.

## Validation

- Unit tests for every record builder, honour, description, and detector.
- `src/test/worldSeasons.test.ts`: records every season, honours matching the
  tables, known outcomes producing their stories once, and the roll of honour
  surviving Delete Old Team History.
- Long run: story yield by kind and season, a readable list of headlines, and
  the time the season-end story pass takes for 112 clubs (it should stay a small
  part of a season's 2.5 minutes, even after 50 seasons).
- A manual 20-season read of the Chronicle for one World: does it read like a
  football almanac, with eras, rises, falls, and rivalries, and not a wall of
  repeated items?
- Normal ZenGM leagues untouched.

## Suggested order

1. Phase 0 (story yield and 6a's measures) and Phase 1 (club season records),
   together, since the report can use the new records. This gives the baseline
   for how far today's World is from real-league concentration.
2. Phase 3 (context in the news), for an early, visible payoff.
3. Phase 2 with 6d (honours, stature, real clubs' history, League History and
   Team Records).
4. 6b (stature in play), tuned toward 6a with 20-season runs.
5. 6c (owners, takeovers, and administration), once the finance ledger in
   progress has landed.
6. Phase 4 (story engine and rivalries), then Phase 5 (Chronicle, previews,
   records, legends).

## Decisions

Decided with the user (2026-09-17):

1. **Dynasties:** like real leagues, a dominant few clubs at the top of each
   Country, challenged once in a while (6a).
2. **Stature:** affects revenue, hype, and which clubs players want to join
   (6b).
3. **Owners:** takeovers, owners pulling out, and administration with points
   deductions (6c).
4. **Managers:** not yet.
5. **Real clubs:** start with their real-world stature, founding year, and
   nickname (6d).

Also decided (2026-09-17):

6. **The user's club and owners:** same rules as AI clubs, so a takeover can
   bring the user a bigger budget and higher expectations, and debt can put the
   user's club into administration.
7. **Liquidation:** no. Repeated administration never throws a club down the
   pyramid.
8. **Real trophies:** real clubs' pre-World trophies don't show in their
   cabinets. They only set starting stature, and honours count what happens in
   the World.
9. **Golden generations:** yes, as a rare event, once 6b's effects are
   measured.
10. **Cups and continental competition:** after the story engine. Another
    session is working on competitions of that kind, so the story engine should
    leave room for them (a story's competition is a field, not assumed to be a
    Division).
11. **News volume:** the user's Country in full, and a digest of the rest.
12. **Writing:** hand-rolled templates for now, with a language model writing
    season reviews planned for the future. Stories keep structured facts so a
    model can write from them later.
