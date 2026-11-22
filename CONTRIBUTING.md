# Contributing

## Setup

```bash
pnpm install
cp apps/web/.env.example apps/web/.env   # fill in the Supabase URLs
pnpm prisma:deploy
SEED_DEMO=yes pnpm seed
pnpm dev
```

## Before you open a change

Run the local gate:

```bash
pnpm self-check          # verify + lint + typecheck + test + build
pnpm self-check --quick  # skip the build
```

Every change should include the test that would have caught the bug. Pure logic
(`lib/`, `firmware/main/*.h`) must be testable without a database, a
board or the network.

## Safety-critical changes

These paths need a second pair of eyes and a bench note:

- `firmware/main/safety.h`
- `firmware/main/filters.h`
- `firmware/main/main.ino` (countdown, SMS, command handling)
- `apps/web/lib/firmware/config.ts` and `firmware/main/config.h`
- `apps/web/app/api/device/incident/route.ts` and the cancel route
- `apps/web/lib/auth/roles.ts` and every query that scopes a vehicle owner

Do not merge a change that makes an alert less likely to reach a human without
explicit owner approval. Never add a code path that suppresses the SOS because a
reading is uncertain.

## Rules

- One change, one branch, one purpose.
- Do not commit `.env`, device tokens, SIM details or private keys.
- Do not run `prisma migrate reset` against a shared database.
- Keep the API envelope and the request pipeline intact.
- Update `docs/` when a contract, a pin or a threshold changes.
- The firmware configuration table and the server table must land together.

## Issue first

1. Run `pnpm overlap:check` before creating a new issue. It lists J-Akiru5's
   open issues and pull requests. Coordinate on an existing item instead of
   duplicating it. If a decision overlaps, J-Akiru5's decision takes priority;
   pause and align instead of merging a competing design.
2. Create an issue from the task or bug template before starting work.
3. Put the objective, scope, acceptance criteria and test plan in the issue.
4. Link it in the pull request with `Closes #N`, `Fixes #N`, `Refs #N` or
   `Part of #N`.

The `Issue policy` check fails a PR without a linked issue. Bot PRs and PRs
labelled `release` or `promotion` are exempt.

## Branch and promotion flow

1. Feature branch -> pull request to `develop`.
2. `develop` -> pull request to `stage` once the integration checks pass.
3. `stage` -> versioned pull request to `main`; only the human owner merges
   `main`.

Never push directly to `develop`, `stage` or `main`. `stage` is the
release-candidate gate and is not a Vercel deployment target.

## Commit style

Conventional commits are welcome: `feat(device): …`, `fix(safety): …`,
`docs(hardware): …`. Small commits with a clear reason are easier to review
than one large commit.
