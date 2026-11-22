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
| `develop` | Integration | Allowed |
| `stage` | Release candidate / promotion gate | **Ineligible** |
| Any other branch | Feature, fix, agent, experiment, Dependabot | **Ineligible** |

`stage` is deliberately not in the allowlist. It is the promotion gate between
`develop` and `main`, and the final deployment is from `main`. Adding `stage` to
`vercel.json` would violate the current deployment policy and fail
`deployment-check.mjs`.

Pull-request previews are deployments. A preview from a non-allowlisted branch
is prohibited. The allowlist is declared in both `vercel.json` files:

```json
{
  "git": {
    "deploymentEnabled": {
      "**": false,
      "main": true,
      "develop": true
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
feature/* --PR--> develop --PR--> stage --PR--> main --tag--> vX.Y.Z
```

- Feature branches open a PR to `develop`; integration checks run.
- `develop` promotes to `stage` through a PR. `stage` is a release candidate and
  is **not** deployed.
- `stage` promotes a versioned release to `main` through a PR. `main` is the only
  production deployment.
- The integrator may merge `develop` and `stage` after the required checks pass.
  Only the human owner merges `main`.

## Version sources of truth

All of these must agree:

| Source | Field |
| --- | --- |
| `package.json` | `version` |
| `apps/web/package.json` | `version` |
| `firmware/platformio.ini` | `-DFW_VERSION="X.Y.Z"` |
| `firmware/main/main.ino` | default `FW_VERSION` |
| `CHANGELOG.md` | dated section for the released version |

`release-check.mjs` enforces that agreement on every pull request. A PR to
`main`, or a push to `main`, also runs `--require-release`, which additionally
requires:

- a dated `## [X.Y.Z] - YYYY-MM-DD` section for the current version;
- an empty `## [Unreleased]` section, because the release entries have moved
  into the version section.

Tags are annotated `vX.Y.Z` and point at the release commit. A repository
ruleset (`immutable-release-tags`) blocks deletion and update of `refs/tags/v*`.
A tag, once pushed, is immutable: never move, delete or replace it. Fix forward
with a new PATCH release.

## Release process

1. Confirm the scope and that all task acceptance criteria are satisfied.
2. Run the full gates: `pnpm self-check` and `bash scripts/verify.sh`.
3. Choose the SemVer bump (MAJOR, MINOR or PATCH) and update `package.json`,
   `apps/web/package.json`, `firmware/platformio.ini` and the `main.ino`
   default.
4. Move the `Unreleased` entries into a dated version section in
   `CHANGELOG.md`; add migration notes for breaking changes.
5. Run `node scripts/release-check.mjs --require-release`.
6. Open the release-prep PR to `develop`; CI must be green.
7. Promote `develop` to `stage` through a pull request; CI must be green.
   `stage` is not a deployment.
8. Open the `stage` -> `main` pull request. `main` requires one approval and
   `release-check --require-release`; the human owner merges it.
9. A human creates and pushes the annotated tag:
   `git tag -a vX.Y.Z -m "vX.Y.Z"` and `git push origin vX.Y.Z`.
10. Confirm the Vercel production deployment came from the tagged `main`
    commit.
11. Run `node scripts/release-check.mjs --tag vX.Y.Z` against the tag before or
    during release verification.

Agents prepare the version, changelog and PR. Agents do not create or push
release tags, publish releases or promote to `main`.

## Branch protection

The `main`, `stage` and `develop` branches are protected by repository settings:

| Control | `main` | `stage` | `develop` |
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

`stage` requires zero approvals so the integrator can promote `develop` without
a second reviewer. The human review gate is `main`, which requires one approval.

The `Deployment policy` and `Issue policy` checks are added to `develop` and
`stage` after their workflows are present. Add both to `main`'s required checks
after promotion. A required check that does not exist on the base branch blocks
every pull request, so it is added only after the workflow is present.

## Agent integration

- Every pull request must link an issue. `Issue policy` enforces it; bot PRs and
  PRs labelled `release` or `promotion` are exempt.
- `integrator` is a subagent that merges only `develop` and `stage` PRs after all
  required checks pass. It runs `node scripts/merge-pr.mjs`, which refuses
  `main`, drafts, conflicts, behind branches, blocked labels and missing/failing
  required checks.
- `release-manager` prepares version bumps and changelog sections. It never
  pushes, tags, merges or deploys.
- `reviewer` is read-only and reports findings; it cannot edit or merge.
- `main` is always merged by the human owner.
- The full protocol is in [`agents.md`](agents.md).

## Vercel controls

Verified statically by `deployment-check.mjs`:

- the `main`/`develop` allowlist in both `vercel.json` files;
- `stage` is not an allowlisted deployment branch;
- the allowlist uses `"**": false`, and the negative pattern actually matches
  branches containing a slash;
- the `pnpm build` build command;
- no `vercel deploy`, `vercel --prod`, `vercel promote`, `vercel redeploy`,
  `vercel rollback`, `npx vercel`, deploy-hook or deployment-API invocation in
  workflows or scripts;
- the repository default branch is `main` (when run in CI with `GH_TOKEN`).

Manual checks that repository tooling cannot prove:

- the Vercel project's **Production Branch** is `main`;
- **Preview Deployments** are disabled for every branch except the allowlist;
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
5. After merge and the production check, backport the fix to `stage` and
   `develop` so the next release does not regress it.
6. Never bypass branch protection, force-push or delete a release tag.

## First-instantiation checklist

- [x] Repository, default branch and integration branch identified.
- [x] Linked Vercel project identified (`lifelinks-web`).
- [ ] Vercel production branch confirmed as `main` in the dashboard.
- [ ] Vercel preview behavior inspected; non-allowlisted previews disabled.
- [x] `vercel.json` allowlist added at the repository root and app root.
- [x] Feature, temporary and Dependabot branches made ineligible by config.
- [ ] Duplicate deployment pathways checked in the dashboard; deploy hooks
      removed.
- [x] Repository workflows and scripts checked by `deployment-check.mjs`.
- [x] Branch protection enabled on `main`, `stage` and `develop`.
- [x] `stage` created from `develop`, protected, and excluded from the Vercel
      allowlist.
- [x] `refs/tags/v*` protected against update and deletion.
- [x] Version sources of truth declared and checked.
- [x] Issue templates, pull-request template and `Issue policy` workflow added.
- [x] `integrator`, `release-manager` and `reviewer` subagents defined.
- [ ] `Deployment policy` and `Issue policy` added to `develop`/`stage`
      required checks after this PR merges.
- [ ] Both checks added to `main`'s required checks after promotion.
- [ ] A `stage` -> `main` release PR passes `release-check.mjs
      --require-release`.

Unchecked items require the human owner and the Vercel dashboard.
