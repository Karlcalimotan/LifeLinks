# Deployment and version policy

This document is the project-specific implementation of the global deployment
governance and versioning rules. It is enforced by branch protection, the
`deployment-policy` workflow and the two scripts below.

```bash
node scripts/release-check.mjs                 # development consistency
node scripts/release-check.mjs --require-release
node scripts/release-check.mjs --tag v0.2.0
node scripts/deployment-check.mjs
```

## Deployment allowlist

Only two branches are eligible for automatic Vercel deployments:

| Branch | Role | Automatic deployment |
| --- | --- | --- |
| `main` | Production | Allowed |
| `develop` | Integration | Allowed |
| Any other branch | Feature, fix, agent, experiment, Dependabot | **Ineligible** |

Pull-request previews are deployments. A preview from a non-allowlisted branch
is prohibited. The allowlist is declared in both `vercel.json` files:

```json
{
  "git": {
    "deploymentEnabled": {
      "*": false,
      "main": true,
      "develop": true
    }
  }
}
```

`deployment-check.mjs` fails if either file drifts from that allowlist, if the
build command changes, or if a workflow/script adds a CLI or API deployment
pathway.

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
6. Open the release PR to `develop`; CI must be green.
7. Promote to `main` through a pull request; the human owner merges.
8. A human creates and pushes the annotated tag:
   `git tag -a vX.Y.Z -m "vX.Y.Z"` and `git push origin vX.Y.Z`.
9. Confirm the Vercel production deployment came from the tagged `main`
   commit.
10. Run `node scripts/release-check.mjs --tag vX.Y.Z` against the tag before or
    during release verification.

Agents prepare the version, changelog and PR. Agents do not create or push
release tags, publish releases or promote to `main`.

## Branch protection

The `main` and `develop` branches are protected by repository settings:

| Control | `main` | `develop` |
| --- | --- | --- |
| Pull request required | Yes | Yes |
| Required approvals | 1 | 0 |
| Dismiss stale approvals | Yes | Not applicable |
| Require approval after last push | Yes | No |
| Required checks | Web, Firmware | Web, Firmware |
| Branch must be up to date | Yes | Yes |
| Conversation resolution | Yes | Yes |
| Linear history | Yes | No |
| Force pushes | Denied | Denied |
| Branch deletion | Denied | Denied |
| Administrators enforced | Yes | Yes |

The `Deployment policy` check must be added to the required-check list on each
branch after this workflow has been promoted to that branch. A required check
that does not exist on the base branch blocks every pull request, so it is added
only after the workflow is present.

## Vercel controls

Verified statically by `deployment-check.mjs`:

- the `main`/`develop` allowlist in both `vercel.json` files;
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
2026-11-22 despite the allowlist. Until the dashboard settings above are
verified by the owner, treat the allowlist as **policy-only**, not verified
platform enforcement.

Do not test the policy by deploying. Use `deployment-check.mjs` and static
configuration inspection. Do not run `vercel build` unless a local build is
needed for another reason; `pnpm build` is the normal local check.

## Emergency change

1. Branch from `main`, not `develop`.
2. Keep the change minimal and add the tests that prove it.
3. Bump PATCH and add a dated changelog section.
4. Open a PR to `main`; required checks and one approval apply.
5. After merge and the production check, backport the fix to `develop` so the
   next release does not regress it.
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
- [x] Branch protection enabled on `main` and `develop`.
- [x] `refs/tags/v*` protected against update and deletion.
- [x] Version sources of truth declared and checked.
- [ ] `Deployment policy` added to required checks after promotion.
- [ ] A release PR to `main` passes `release-check.mjs --require-release`.

Unchecked items require the human owner and the Vercel dashboard.
