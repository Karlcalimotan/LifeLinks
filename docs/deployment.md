# Deployment and version policy

This document is the project-specific implementation of the global deployment
governance and versioning rules. It is enforced by branch protection, the
`deployment-policy` workflow and the two scripts below.

```bash
node scripts/release-check.mjs                 # development consistency
node scripts/release-check.mjs --require-release
node scripts/release-check.mjs --tag v0.2.0
node scripts/deployment-check.mjs
pnpm self-check                                # includes both policy checks
```

## Deployment allowlist

Only two branches are eligible for automatic Vercel deployments:

| Branch | Role | Automatic deployment |
| --- | --- | --- |
| `main` | Production | Allowed |
| `staging` | Preview / release candidate | Allowed |
| `develop` | Integration and reconciliation gate | **Ineligible** |
| Any other branch | Feature, fix, agent, experiment, Dependabot | **Ineligible** |

`develop` is where every change reconciles and where the integration gate runs,
but it does not deploy. `staging` is the preview environment: owners promote
`develop` to `staging`, verify the preview, then promote `staging` to `main`.
The earlier `stage` branch is retired in favour of `staging`.

Pull-request previews are deployments. A preview from a non-allowlisted branch
is prohibited. The allowlist is declared in both `vercel.json` files:

```json
{
  "git": {
    "deploymentEnabled": {
      "**": false,
      "main": true,
      "staging": true
    }
  }
}
```

Minimatch splits branch names on `/`. A single `*` never crosses a slash, so
`"*": false` does not cover `setup/agent-foundation` or
`policy/strict-deployment`; Vercel treats those branches as unspecified and
deploys them. `"**": false` matches at any depth. `deployment-check.mjs` asserts
that the negative pattern matches a slash branch, so an ineffective glob fails
CI.

`deployment-check.mjs` also fails if either file drifts from that allowlist, if
the build command changes, or if a workflow/script adds a CLI or API deployment
pathway.

## Promotion flow

```text
feature/* --PR--> develop (gate) --PR--> staging (preview) --PR--> main --tag--> vX.Y.Z
```

- Feature branches open a PR to `develop`; integration checks run. `develop` is
  the reconciliation gate and is **not** deployed.
- `develop` promotes to `staging` through a PR once the checks pass. `staging`
  is the preview deployment.
- `staging` promotes a versioned release to `main` through a PR. `main` is the
  only production deployment.
- The integrator may merge `develop` and `staging` after the required checks
  pass. Only the human owner merges `main`.

## Version sources of truth

The application/PWA and the firmware version independently. A change to one does
not force a bump or a release of the other.

### Application and PWA

The PWA is generated from `apps/web`; it shares the application version. There is
no separate PWA package.

| Source | Field |
| --- | --- |
| `package.json` | `version` |
| `apps/web/package.json` | `version` |
| `CHANGELOG.md` | dated section for the released version |

`release-check.mjs` requires the two package files to agree and validates the
CHANGELOG section. A PR to `main`, or a push to `main`, also runs
`--require-release`, which additionally requires:

- a dated `## [X.Y.Z] - YYYY-MM-DD` section for the current version;
- an empty `## [Unreleased]` section, because the release entries have moved
  into the version section.

### Firmware

| Source | Field |
| --- | --- |
| `firmware/platformio.ini` | `-DFW_VERSION="X.Y.Z"` |
| `firmware/main/main.ino` | default `FW_VERSION` |

`release-check.mjs` requires the two firmware sources to agree and to be valid
SemVer, but **does not compare them to the application version**. The firmware
version is reported separately by the check and echoed in every heartbeat as
`firmware_version`.

The tracker list shows an “Update available” marker by comparing each installed
version with `LIFELINK_FIRMWARE_VERSION`. When that variable is empty, the
marker falls back to the repository `FW_VERSION`. The marker is display-only;
OTA still requires the configured signed manifest (version, URL, SHA256 and
signature).

Application releases are annotated `vX.Y.Z`; firmware releases use `fw-vX.Y.Z`.
The `immutable-release-tags` ruleset blocks deletion and update of
`refs/tags/v*`; the owner should extend it to `refs/tags/fw-v*` before the first
firmware tag. A tag, once pushed, is immutable: never move, delete or replace it.

## Release process

### Application and PWA

1. Confirm the scope and that all task acceptance criteria are satisfied.
2. Run the full gates: `pnpm self-check` and `bash scripts/verify.sh`.
3. Choose the SemVer bump (MAJOR, MINOR or PATCH) and update `package.json` and
   `apps/web/package.json`. Do not bump the firmware version unless the firmware
   changed.
4. Move the `Unreleased` entries into a dated version section in
   `CHANGELOG.md`; add migration notes for breaking changes.
5. Run `node scripts/release-check.mjs --require-release`.
6. Open the release-prep PR to `develop`; CI must be green.
7. Promote `develop` to `staging` through a pull request once CI is green.
   `staging` is the preview deployment; verify it before promotion.
8. Open the `staging` -> `main` pull request. `main` requires one approval and
   `release-check --require-release`; the human owner merges it.
9. A human creates and pushes the annotated tag:
   `git tag -a vX.Y.Z -m "vX.Y.Z"` and `git push origin vX.Y.Z`.
10. Confirm the Vercel production deployment came from the tagged `main`
    commit.
11. Run `node scripts/release-check.mjs --tag vX.Y.Z` against the tag before or
    during release verification.
12. Back-merge after release: merge `main` back into `develop` and `staging`
    through a pull request. This keeps the histories aligned so the next
    promotion is not reported as `BEHIND`. `main` is never force-pushed or
    rewritten.

### Firmware

1. Bump `FW_VERSION` in `firmware/platformio.ini` and
   `firmware/main/main.ino` together. The application version is untouched.
2. Run `pio test -d firmware -e native` and `pio run -d firmware`.
3. Merge through `develop` -> `staging` -> `main` like any other change.
4. A human tags `fw-vX.Y.Z` after the firmware is flashed and verified on the
   bench.

Agents prepare the version, changelog and PR. Agents do not create or push
release tags, publish releases or promote to `main`.

## Branch protection

The `main`, `staging` and `develop` branches are protected by repository settings:

| Control | `main` | `staging` | `develop` |
| --- | --- | --- | --- |
| Pull request required | Yes | Yes | Yes |
| Required approvals | 1 | 0 | 0 |
| Dismiss stale approvals | Yes | Not applicable | Not applicable |
| Require approval after last push | Yes | No | No |
| Required checks | Web, Firmware, Deployment policy and Issue policy after promotion | Web, Firmware, Deployment policy, Issue policy | Web, Firmware, Deployment policy, Issue policy |
| Branch must be up to date | Yes | Yes | Yes |
| Conversation resolution | Yes | Yes | Yes |
| Linear history | Yes | No | No |
| Force pushes | Denied | Denied | Denied |
| Branch deletion | Denied | Denied | Denied |
| Administrators enforced | Yes | Yes | Yes |

`staging` requires zero approvals so the integrator can promote `develop`
without a second reviewer. The human review gate is `main`, which requires one
approval.

The `Deployment policy` check is present on `develop` and `staging`. The
`Issue policy` check is added after this PR merges. Add both to `main`'s
required checks after promotion. A required check that does not exist on the
base branch blocks every pull request, so it is added only after the workflow is
present.

## Agent integration

- Every pull request must link an issue. `Issue policy` enforces it; bot PRs and
  PRs labelled `release` or `promotion` are exempt.
- `integrator` is a subagent that merges only `develop` and `staging` PRs after
  all required checks pass. It runs `node scripts/merge-pr.mjs`, which refuses
  `main`, drafts, conflicts, behind branches, blocked labels and missing/failing
  required checks.
- `release-manager` prepares version bumps and changelog sections. It never
  pushes, tags, merges or deploys.
- `reviewer` is read-only and reports findings; it cannot edit or merge.
- `main` is always merged by the human owner.
- The full protocol is in [`agents.md`](agents.md).

## Vercel controls

Verified statically by `deployment-check.mjs`:

- the `main`/`staging` allowlist in both `vercel.json` files;
- `develop` is not an allowlisted deployment branch;
- the allowlist uses `"**": false`, and the negative pattern actually matches
  branches containing a slash;
- the `pnpm build` build command;
- no `vercel deploy`, `vercel --prod`, `vercel promote`, `vercel redeploy`,
  `vercel rollback`, `npx vercel`, deploy-hook or deployment-API invocation in
  workflows or scripts;
- the repository default branch is `main` (when run in CI with `GH_TOKEN`).

Manual checks that repository tooling cannot prove:

- the Vercel project's **Production Branch** is `main`;
- **Preview Deployments** are enabled only for `staging` and disabled for every
  other branch;
- no deploy hooks or third-party deployment integrations exist in the Vercel
  dashboard;
- the allowlist configuration is loaded from the branch being deployed or from
  `main`.

A preview deployment was observed for a non-allowlisted feature branch on
2026-11-22. The cause was the ineffective `"*": false` pattern: minimatch does
not let `*` cross `/`. The config now uses `"**": false`, and the check asserts
that the negative pattern covers slash branches. If Vercel reads configuration
from `main` rather than from the branch being deployed, the fix takes effect
only after it reaches `main`; until then a preview from a slash branch may still
appear. The next slash-branch PR is the observation, not a test deployment. The
dashboard settings above remain manual checks.

Do not test the policy by deploying. Use `deployment-check.mjs` and static
configuration inspection. Do not run `vercel build` unless a local build is
needed for another reason; `pnpm build` is the normal local check.

## Scheduled retention cleanup

`GET /api/cron/retention` enforces the per-organisation
`telemetryRetentionDays` and `incidentRetentionDays` settings from Settings.
The schedule is declared in both `vercel.json` files:

```json
"crons": [
  { "path": "/api/cron/retention", "schedule": "15 18 * * *" }
]
```

The expression is UTC: 18:15 UTC, which is 02:15 the next day in Asia/Manila.
It runs once daily. On the Hobby plan Vercel may start it anywhere in the
18:00 UTC hour, so treat it as a nightly window rather than an exact minute.
Vercel cron jobs run only on the production deployment; a preview on `staging`
does not run the schedule.

### Secret

The route requires `Authorization: Bearer <CRON_SECRET>`. When
`CRON_SECRET` is not set (or is blank) the route returns `503` and does no
database work: a missing secret disables the job safely instead of deleting
without authentication. A wrong or missing header returns `401`.

Vercel sends the project's `CRON_SECRET` as the `Authorization` header on
scheduled invocations once the variable exists in the project settings. Set it
for the Production environment and redeploy: a deployment keeps the
`CRON_SECRET` value it was built with, so editing the variable alone does not
change the value an existing deployment reads or the header Vercel sends to it.

### Manual run and dry run

```bash
# Count what would be deleted; no row is removed.
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://<production-host>/api/cron/retention?dryRun=1"

# Real cleanup.
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://<production-host>/api/cron/retention"
```

The JSON response reports, per organisation, the two cutoffs, how many
telemetry samples, incidents and alert deliveries were deleted (or would be
deleted), the batch counts and whether the run was truncated. It never returns
row contents, coordinates, phone numbers or the secret. A dry run writes the
same audit row as a real run with `dryRun: true` and writes nothing else.

### What is deleted

- `TelemetrySample` rows whose `recordedAt` is older than now minus
  `telemetryRetentionDays`, scoped to the organisation that owns the device.
- `ImpactEvent` rows whose `createdAt` is older than now minus
  `incidentRetentionDays`, scoped to the organisation.
- `AlertDelivery` rows for those incidents. They are deleted explicitly first
  in the same batch transaction as the incident, even though the foreign key
  also cascades. `DeviceCommand` rows are kept; their optional
  `impactEventId` becomes null by the existing `SET NULL` rule.
- Nothing newer than a cutoff is touched. A stored period that is not a
  positive number is skipped rather than treated as "delete everything".

The work is bounded: at most 5,000 rows per delete batch and 20 batches per
organisation and table per invocation. If the cap is reached the response and
audit metadata say `truncated: true`; the next daily run continues. The route
is safe to call repeatedly and does not use a lock, so two overlapping runs
may report counts that differ from what each one actually removed.

### Audit

Each run writes one `AuditLog` row per organisation with settings: action
`retention.cleanup`, `target` set to the organisation id, and metadata
containing the two cutoffs, the configured day counts, the deleted counts, the
batch counts, `dryRun` and `truncated`. The row contains configuration and
counts only, never personal data.

An organisation without an `OrgSettings` row is not processed, even though the
application defaults would apply elsewhere. Create its settings row (opening
and saving Settings does this) before relying on retention for it.

### Owner action

1. Set `CRON_SECRET` in the Vercel project's Production environment. Use a
   random value with header-safe characters only; leading or trailing spaces
   make every invocation return `401`.
2. Redeploy `main` so the deployment reads the new value and Vercel registers
   the `crons` entry from `vercel.json`.
3. After the first scheduled window, check the Cron Jobs logs for a `200` and
   the `retention.cleanup` audit rows for that organisation.
4. Rotate the secret by updating the variable, redeploying and confirming the
   first invocation returns `200`, as described in the Vercel cron
   documentation.

A `401` means the deployment and the header disagree, or `CRON_SECRET` is not
set for Production. A `503` means the route could not read a secret at all and
deleted nothing. Neither case deletes data.

## Emergency change

1. Branch from `main`, not `develop`.
2. Keep the change minimal and add the tests that prove it.
3. Bump PATCH and add a dated changelog section.
4. Open a PR to `main`; required checks and one approval apply.
5. After merge and the production check, backport the fix to `staging` and
   `develop` so the next release does not regress it.
6. Never bypass branch protection, force-push or delete a release tag.

## First-instantiation checklist

- [x] Repository, default branch and integration branch identified.
- [x] Linked Vercel project identified (`lifelinks-web-eight`).
- [ ] Vercel production branch confirmed as `main` in the dashboard; `staging`
      set as the preview branch.
- [ ] Vercel preview behavior inspected; only `staging` may produce previews.
- [x] `vercel.json` allowlist added at the repository root and app root.
- [x] Feature, temporary and Dependabot branches made ineligible by config.
- [ ] Duplicate deployment pathways checked in the dashboard; deploy hooks
      removed.
- [x] Repository workflows and scripts checked by `deployment-check.mjs`.
- [x] Branch protection enabled on `main`, `staging` and `develop`.
- [x] `staging` created from `develop`, protected, and allowlisted for preview
      deployments.
- [x] `refs/tags/v*` and `refs/tags/fw-v*` protected against update and
      deletion.
- [x] Version sources of truth declared and checked: application/PWA and
      firmware are independent.
- [x] Issue templates, pull-request template and `Issue policy` workflow added.
- [x] `integrator`, `release-manager` and `reviewer` subagents defined.
- [ ] `Deployment policy` and `Issue policy` added to `develop`/`staging`
      required checks after this PR merges.
- [ ] Both checks added to `main`'s required checks after promotion.
- [ ] A `staging` -> `main` release PR passes `release-check.mjs
      --require-release`.

Unchecked items require the human owner and the Vercel dashboard.
