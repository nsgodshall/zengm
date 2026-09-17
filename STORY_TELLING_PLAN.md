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

**Status: done.** The report is implemented and the 20-season baseline is
measured; see `ROADMAP.md` for the numbers, which Phase 6a is now tuned
against.

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
- **Measured** (2026-09-17): the baseline and the first stature effects are in
  `ROADMAP.md`. Titles are spread far wider than real leagues (6–7 different
  champions a decade), and the wage budget ceiling was why: every top-tier club
  sat at it. A Country with only two tiers has no "bottom tier to top" climb to
  measure, so that one only counts Countries with three or more.

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

**Status: honours, the history pages, and stature implemented; founding years
and nicknames wait for Phase 6d's real club data.**

- **Honours** (`competition/clubHonours.ts`, pure, from a club's saved
  history): titles by tier, dynasties (3 top-tier titles within 5 seasons,
  overlapping runs joined), promotions (and whether through a playoff),
  relegations, promotion playoffs won and lost, seasons on each tier, best
  finish, the current and longest runs in the top tier, and whether the club
  has never been relegated. The story yield report shares the dynasty rule.
- **Team history page** (`competition/clubHonoursInfo.ts`,
  `ui/views/TeamHistory/WorldHonours.tsx`): in a World, an Honours box replaces
  ZenGM's playoff appearances, finals, and championships: record, titles for
  each Division with their seasons, dynasties, promotions, relegations,
  promotion playoffs, best finish, seasons in each Division, the top-flight run,
  "never relegated", and the club's record signing. Each season in the Seasons
  list shows the club's place and Division, (C) for a title, and ▲/▼ for moves.
- **League History** (`competition/worldLeagueHistory.ts`,
  `ui/components/WorldRollOfHonour.tsx`): in a World, a roll of honour for each
  Country, season by season: the champion of every tier with how many titles it
  had by then, the top tier's runner-up, and the clubs promoted to and relegated
  from the top tier, in place of ZenGM's league champion, runner-up, and awards.
- **Team Records:** in a World, seasons in the top tier, titles, last title,
  lower-tier titles, promotions, relegations, and best finish replace playoff
  appearances, finals, titles, and best records.
- **Tested:** unit tests for honours, dynasties, runs, and the roll of honour.
  The World season test checks the team history, League History, and Team
  Records views against every club's saved history.
- **Stature** (`competition/clubStature.ts`, pure): a number from 0 to 100 for
  how big a club is. Each season's finish adds legacy (10 for a top-tier title,
  7 for second, 5 for the top four, 3 for the top half, 2 below; 1.5 or 1 in a
  second tier, 0.75 or 0.5 below), and legacy fades by half every 12 seasons.
  Legacy gives up to 70 points on a saturating curve, and market size up to 30
  on a log scale from 0.5 to 15 million people. Always winning a top tier in a
  big market settles near 90; a top-half top-tier club in a middling market
  near 45; a second-tier club in a small market below 25. Every club starts
  with the legacy of a club that has always been on its starting tier (40, 15,
  or 5), saved as its seed (`worldStatureSeed`), and each season's stature is
  saved with its history entry and record, so it can be charted. Labels:
  "Yo-yo club" (3 promotions and 3 relegations in 10 seasons), "Sleeping giant"
  (60 or more outside the top tier), "Rising" or "Fading" (10 points up or down
  in 5 seasons), otherwise "Giant" (75), "Big club" (60), "Established" (45),
  "Modest" (30), or "Minnow". It shows on the team page, the Honours box, and
  Team Records. For now it only describes clubs; Phase 6d gives real clubs real
  starting stature, and Phase 6b makes it affect hype, revenue, and players'
  choices. In a 40-club test World after 3 seasons it ran from 14 (Almería) to
  59 (Liverpool and Manchester United).
- **Founding years and nicknames** (still to do): from Phase 6d's data, shown
  on the team page.

### Phase 3: context in the news

**Status: titles, promotion, relegation, and transfers implemented.** The
cheapest big improvement, and the first use of the saved records.

- **Titles, promotion, and relegation** (`competition/storyContext.ts`, pure):
  a Division champion's news says when it's a title in a row ("They're
  champions for the second season in a row", "It's a record fifth title in a
  row", or equalling the Country's record run on that tier), when the club was
  only promoted last season, when titles come close together ("It's their third
  title in 5 seasons"), or when it ends a long wait ("their first title since
  2031", "their first title in 12 seasons"). Promotion news says when a club
  bounces straight back, is back after several seasons away, reaches a Division
  for the first time in a long while, or goes up again in a row. Relegation news
  says when the club were champions within 3 seasons, go straight back down,
  go down again in a row, end a long stay on the tier, or suffer a first
  relegation in a long while. Only the World's own history counts (decided:
  real trophies don't), so "first" wording needs at least 10 seasons of history
  (`STORY_CONTEXT_SETTINGS`).
- **Transfers** (`competition/transferRecords.ts`, pure): a fee that breaks the
  World's, the buying club's Country's, or the buying club's own record says so
  (only the biggest is mentioned; a club's first fee isn't called a record), and
  so does a player returning to the club he started at (his academy club, or
  his first club). The World's and each Country's record fees are a game
  attribute (`worldTransferRecords`) and each club's record signing is on the
  club (`worldRecordSigning`); an older World finds them from its players'
  transfers once when it loads (`worldTransferRecordsFilled`).
- **Scores:** rarer stories add 5–15 to the news item's score, so they show on
  the dashboard and in the big news filter.
- **Tested:** unit tests for every description and record rule. The World
  season test checks that each champion's, promoted club's, and relegated
  club's news carries the sentences its history calls for (and that some
  appear within 3 seasons), that record fees match the biggest fees paid, and
  that an older World finds the same records when it loads.
- **Still to do:** fees between rivals ("from their rivals") wait for Phase 4's
  rivalries.

### Phase 4: recognize (the story engine)

**Status: season-end stories, in-season stories, and rivalries implemented;
player stories (legends, golden generations) still to do.**

What landed (`competition/worldStories.ts`, pure, and
`competition/recordWorldStories.ts`):

- **Season-end detectors**, run for each Country after the season's records
  are saved: a title defended in a row, promoted champions, a close title race
  (won by 3 points or fewer, or on tiebreakers), a dynasty beginning (a third
  top-tier title in 5 seasons), the end of an era (two seasons without a title
  after a dynasty), a challenger's title (a champion outside the top tier's 3
  biggest clubs by stature going into the season), fallen giants (a stature 70+
  club relegated from the top tier), a climb (promoted to the top tier from 2
  or more tiers below within 5 seasons), a yo-yo club (the season it reaches 3
  promotions and 3 relegations in 10 seasons), record and fewest top-tier
  points (with at least 5 earlier seasons), and unbeaten and winless seasons
  (from the season's runs). Thresholds are in `WORLD_STORY_SETTINGS`.
- **Saved** as news items of a new `story` type with the structured facts they
  were written from (`story` on the event: kind, Country, Division,
  significance, and facts), so wording can change or a language model can
  write from them later. A new Stories category filters them on the News page.
- **News volume** (decided): a story's news score is half its significance in
  the user's Country and a quarter elsewhere, so other Countries' stories only
  reach the big news when they're big. The user gets a notification for a story
  about their own club.
- **Older Worlds** find the stories of every recorded season once when they
  load (`worldStoriesFilled`). A season that already has stories isn't done
  again.
- **Tested:** unit tests for every detector and its wording. The World season
  test checks that each season's saved stories are exactly what the detectors
  find from the saved histories, and that an older World finds them again.
- **Rivalries** (`competition/rivalries.ts`, pure): clubs in the same town
  within a Country play a derby (5 points, which never fade). Shared history
  adds more, fading by 15% a season: finishing first and second in a Division
  (4), going up or down together from the same Division (1.5), and meeting in
  a promotion playoff (2). A pair needs 3 points to be rivals, and each club
  keeps its 3 strongest (`RIVALRY_SETTINGS`). A club's history page lists its
  rivals with why (the derby, title races, going up or down together, playoff
  meetings) and its all-time regular season record against each, linking to
  head-to-head. A title race between clubs from the same town reads "from their
  Madrid rivals". Rivalries are worked out from the saved histories when shown,
  so nothing new is stored.
- **In-season stories** (`competition/inSeasonStories.ts`, pure, and
  `competition/recordInSeasonStories.ts`), checked after each regular season
  day: a Division title or automatic promotion clinched, or relegation
  confirmed, while games are still to play (settled means no other club can
  still reach the points, counting ties as reachable), and winning and losing
  runs at 10 games and every 5 after (a run is told again once a new one
  starts). What's been told this season is kept in a small game attribute
  (`worldInSeasonStoryState`), so each is told once. They're story news like
  the season-end stories, and show in the Chronicle too.
- **Fixed on the way:** stories found again for an older World read that
  season's team seasons from the database, not just the cache, so they match
  what was found when the season ended.

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

**Status: the World Chronicle page, the World Season Preview, club legends,
each Country's records, and the dashboard's Around the World implemented; the
rest still to do.**

What landed: the **Chronicle** (League → Chronicle, World only;
`competition/worldChronicle.ts`, `ui/views/WorldChronicle.tsx`): pick a
finished season, and each Country, the user's first, leads with its biggest
story, lists the rest, and shows each Division's champion with points and who
went up (with (P) for playoff winners) and down, from the saved histories. It
links to that season's Season Summary and League Tables.

The **Season Preview** in a World (`competition/seasonStorylines.ts`, pure)
opens with what to watch in each Country, the user's first: the champions
defending their title (and chasing the Country's record run), the strongest
squads in the top tier, the clubs promoted into it and what their promotion
means (straight back, back after years away, or there for the first time in a
long while), big clubs stuck below the top tier (stature 60 or more), and the
derbies in each Division, marking one that's back after a move. Its thresholds
are in `SEASON_STORYLINE_SETTINGS`.

**Club legends** (`competition/clubLegends.ts`, pure): a World club's history
page names its most-used players and top scorers (the same stat as its
Division's Top Scorer award), its one-club players, and its academy graduates,
each with games played and the seasons they played, from the players who have
played for it.

**Records** (League → Records, World only; `competition/worldRecords.ts`,
pure): each Country, the user's first, with its records (most and fewest points
in a season, most titles in a row, longest run in the top tier, longest winning
and unbeaten runs, and biggest win with the score and opponent), its clubs with
the most titles, and its all-time top-tier table (seasons, record, points, and
titles). All of it comes from the season records saved on team seasons, and a
run of one season doesn't count as a record.

**Around the World** on the dashboard: the biggest recent stories from the
World's other Countries (this season's first, then last season's), with a link
to the Chronicle. The user's own Country's stories are already in the headlines
below it.

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

**Status: hype, revenue, free agency, and player mood implemented, with first
guesses waiting for a long run; transfers and the talent pool still to do.**

- **Saved stature:** each club keeps its stature after its latest finished
  season (`worldStature`), set when a World is made and when each season is
  recorded, and filled in when an older World loads. The effects read it
  (`competition/statureEffects.ts`, settings in `STATURE_EFFECT_SETTINGS`, which
  the long run can override with `WORLD_LONG_RUN_STATURE`). Every effect is
  neutral at stature 45, about a World's average.
- **Hype:** the summer pull (`regressHype`) goes toward a resting point from 0.3
  (stature 0) to 0.75 (stature 100) instead of 0.5, so a giant keeps its crowds
  through a bad season and a small club's excitement after a good one fades.
- **Revenue:** merchandise and sponsorship change 1.5% for each point of
  stature from 45, between 0.6× and 1.8× (a stature 95 club earns 1.75×),
  applied after the season-length scaling and separately from the commercial
  infrastructure multiplier the finance ledger work adds. Attendance already
  follows hype, and wage budgets follow revenue, so bigger clubs can pay more
  without a separate rule.
- **Players want to join big clubs:**
  - **Free agency** (`autoSign`): each day, clubs act in a random order where a
    stature 100 club is 3 times as likely as a stature 0 club to go first, so
    bigger clubs tend to get first pick, and free agents ask 0.4% less for each
    point of stature above 45 and more below it (between 0.8× and 1.15×, never
    under the minimum contract).
  - **Mood:** a "Club stature" component, from −2 to +2 (1 for every 25 points
    from 45), counts in every World player's mood toward a club, which affects
    the user's negotiations and re-signings.
  - Still to do: transfers (a player won't drop far down in stature without a
    clear step up, and a star at a much smaller club can push for a move) and
    international talent-pool players preferring bigger clubs. Both touch files
    the finance ledger work is changing, so they wait for it to land.
- **Brakes on runaway dynasties:** stature fades, each effect is capped, the
  squad planner's roles mean a player still wants minutes, squads age, and 6c's
  takeovers fund challengers. The long run tunes the caps toward 6a.
- **Tested:** unit tests for every effect and the signing order. The World
  season test checks that clubs keep their latest stature, that players' mood
  counts it, and that an older World fills it in when it loads.

#### 6c. Owners, takeovers, and administration

**Status: owners, takeovers, benefactors' money, administration, and points
deductions implemented; transfer embargoes and forced sales still to do.**

- **Owners** (`competition/clubOwners.ts`, pure): every club has an owner of
  one kind — a local owner, a wealthy benefactor, an investment group, or fan
  owned — with the season they took over and what they put in. New Worlds get
  owners at once, older Worlds when they load, and each kind covers a different
  amount of debt before a club is in trouble (1, 3, 1.5, and 0.75 times
  revenue).
- **Takeovers**, checked each summer after promotion and relegation
  (`competition/recordClubOwners.ts`): 1.5% a club, 3 times as likely for a
  sleeping giant (stature 60 or more outside the top tier), 2.5 times for a
  club whose debt is past a season's revenue, and much less likely for
  champions. A benefactor puts in 30–80% of the club's revenue each season for
  3–8 seasons; the money goes into its cash and counts as income in the board's
  wage budget, so it can buy and pay players. That's where challengers to the
  dominant few come from.
- **Money running out:** when a benefactor's seasons are up, the club lives on
  what it earns again. Both the takeover and the end of the money are told as
  stories, and the team page names the owner and what they put in.
- **Administration:** when a club's debt passes what its owner will cover, it
  goes into administration at the end of the season: its debts are written off,
  it loses about a tenth of a season's points next season, someone else takes
  it on, and it's told as a story. Deducted points come off in the tables, which
  show them as "(-11)", and any season's table can find the deduction that
  applied to it (`worldPointsDeductions` on the club). Decided: no liquidation,
  so a club is never thrown down the pyramid.
- **Still to do:** a transfer embargo and forced sales of the best-paid players
  while a club is in administration.
- **Tested:** unit tests for takeover chances, owner changes, a benefactor's
  money running out, and debt limits by kind; the World season test checks
  every club has an owner and only a benefactor puts money in.

#### 6d. Real clubs' real history

**Status: implemented, with the data drafted for the user's review.**

- **Data** (`competition/realClubHistory.ts`): every one of the 260 real clubs
  has a starting stature from its real standing: for football clubs, titles,
  seasons in the top flight, and European success; for the American, Japanese,
  and Mexican teams, their standing in their own sport (the Yankees start at
  95, Real Madrid at 95, Bayern Munich at 96). The British, Spanish, and German
  clubs also have founding years and nicknames, left out where uncertain. The
  American, Japanese, and Mexican teams have none yet. **All of it is a first
  draft for the user to review Country by Country.**
- **Starting stature:** a new World seeds each real club with the legacy that
  gives its starting stature at its market size (`getLegacyForStature`); a
  stature below what the market alone is worth needs no legacy, and one above
  what legacy can add is capped (Real Madrid's 95 comes out at 93). Other clubs
  keep the starting-tier seed. A real club is matched by abbreviation, region,
  and name, since ZenGM's default Baltimore Crabs and Portland Roses are also
  real American clubs but its other default teams only share towns.
- **Founding year and nickname** show on the team page next to its stadium and
  market.
- **Older Worlds** give their real clubs founding years and nicknames, and real
  starting stature if they have no stature seed yet, once when they load
  (`worldRealClubHistoryFilled`).
- Decided: real trophies don't show in cabinets; honours count what happens in
  the World.
- **Tested:** every real club has an entry with a sensible stature and founding
  year, and nothing else does; a club sharing only an abbreviation and town
  isn't matched; starting stature turns into legacy and back within a point.
  The pilot World test checks every real club's stature, founding year, and
  nickname at creation.

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
