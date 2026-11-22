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
| Required checks | Web, Firmware, Deployment policy after promotion | Web, Firmware, Deployment policy | Web, Firmware, Deployment policy |
| Branch must be up to date | Yes | Yes | Yes |
| Conversation resolution | Yes | Yes | Yes |
| Linear history | Yes | No | No |
| Force pushes | Denied | Denied | Denied |
| Branch deletion | Denied | Denied | Denied |
| Administrators enforced | Yes | Yes | Yes |

`staging` requires zero approvals so the integrator can promote `develop`
without a second reviewer. The human review gate is `main`, which requires one
approval.

The `Deployment policy` check is present on `develop` and `staging`. Add it to
`main`'s required checks after the workflow has been promoted to `main`. A
required check that does not exist on the base branch blocks every pull request,
so it is added only after the workflow is present.

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
- [ ] `Deployment policy` added to `main`'s required checks after promotion.
- [ ] A `staging` -> `main` release PR passes `release-check.mjs
      --require-release`.

Unchecked items require the human owner and the Vercel dashboard.
