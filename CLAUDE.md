# International Soccer Zen GM (mod of ZenGM)

This is a fork of [ZenGM](https://github.com/zengm-games/zengm) being turned into a basketball game with world club soccer's structure: many countries, tiered leagues with promotion/relegation, and a transfer market instead of the draft and salary cap.

**Read `ROADMAP.md` first.** It has the plan, the terminology (World, Country, Division, Club, PromotionRelegationLink), every decision made so far, and each epic's status: what landed and what's still to do.

## Where things are

- Work happens on the `international-soccer-mod` branch. `upstream` should point at `zengm-games/zengm` (add it with `git remote add upstream https://github.com/zengm-games/zengm.git` if missing).
- Mod code lives mostly in `src/worker/core/competition/`. Changes to upstream files are marked with `// International Soccer Zen GM mod (Epic N)` comments.
- Everything mod-specific only applies to a **World with more than one Division** (`isSingleDivision(getCompetitionStructure())` is false). A normal ZenGM league must keep behaving exactly as upstream.

## Rules

- **Stay mergeable with upstream.** Don't delete upstream code when a setting can turn it off (e.g. the draft and salary cap are off via `draftType: "freeAgents"` and `salaryCapType: "none"`). Branch on "is this a World" at a single call site instead.
- **Never bump `LEAGUE_DATABASE_VERSION`** or add a numbered migration for mod data. Fill in missing data when a league loads instead (see `ensureCompetitionStructure`).
- **Keep the competition engine sport-agnostic.** No scattered `isSport` checks in scheduling, tables, or promotion/relegation.
- Put logic in pure, unit-tested functions, with a thin worker layer that reads and writes the database.
- Update `ROADMAP.md` (status, decisions, what's still open) as part of each chunk of work.

## Running things

- Needs Node 24 and pnpm (`pnpm install`).
- Tests: `node --run test` (add `-- <paths>` for specific files). Typecheck: `node --run lint-ts`. Lint: `node_modules/.bin/eslint <files>`. Format: `node_modules/.bin/oxfmt <files>`.
- `src/test/worldSeasons.test.ts` creates a 2-country × 2-tier World and auto plays 3 full seasons through the real game code. Run it after changing anything in season flow, scheduling, transfers, or contracts.
- The pre-commit hook runs `pnpm lint-staged`, so `pnpm` has to be on PATH to commit.

## Workflow

- The user wants each finished, verified chunk committed and pushed to `origin/international-soccer-mod`, with typecheck, lint, and the full test suite passing first.
- Ask before design decisions that change how the game plays (see the decisions recorded in `ROADMAP.md`).
