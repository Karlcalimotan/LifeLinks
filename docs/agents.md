# Agent collaboration

This repository uses a small, bounded multi-agent workflow. The goal is not more
agents; it is a clear owner, a traceable issue, an isolated worktree and an
independent check.

## Roster

| Agent | Mode | Responsibility | Hard limit |
| --- | --- | --- | --- |
| parent / orchestrator | primary | Owns the issue, scope, worktree, verification and final report | Does not bypass checks or merge `main` |
| `reviewer` | subagent | Read-only review for correctness, safety, regressions and missing tests | Read/glob/grep only; no shell, edit, push or merge |
| `release-manager` | subagent | Version bumps, changelog sections and release checks | Release files only; no push, tag, merge, deploy or `main` |
| `integrator` | subagent | Merges PRs into `develop` and `staging` after every required check passes | Cannot merge `main` or bypass protection |

The definitions live in `.opencode/agents/`. OpenCode discovers them from the
project. If a newly added agent does not appear, run `opencode reload` or restart
the background service.

## Task records

Issue-first is recommended, not required, for feature, `develop` and `staging`
work. Use an issue for multi-day or cross-team work; a clear PR description is
enough for a small change. The `Issue policy` check is advisory on `develop` and
`staging` and does not block a merge. Main-bound release PRs require the owner's
approval and release notes; they do not require a separate issue.

Run `pnpm overlap:check` before starting to avoid duplicate work. Do not take
over an issue assigned to someone else; coordinate on J-Akiru5's issue or PR
instead of creating a competing one.

## Overlap check

Before creating an issue or starting work, run the read-only preflight:

```bash
pnpm overlap:check
```

It lists J-Akiru5's open issues and pull requests. The raw commands are also
available if the script cannot run:

```bash
gh issue list --state open --author J-Akiru5
gh issue list --state open --assignee J-Akiru5
gh pr list --state open --author J-Akiru5
```

If an issue or PR already covers the task, comment on it and coordinate instead
of creating a duplicate. Do not take over an issue assigned to another person.
J-Akiru5 currently owns the firmware lane 3 items (#14, #15, #16); do not
duplicate that work.

**Overlap priority:** when a decision overlaps, J-Akiru5's decision takes
priority. Pause the conflicting work, comment on his issue or PR, and align with
his design. Do not merge a competing deployment, branch or data-model decision
while his is open.

## Worktrees and ownership

- One task, one issue, one worktree, one branch.
- Give every subagent the absolute worktree path, branch, files it owns, and
  whether it may write.
- Never edit another agent's worktree. Hand work over with a commit SHA or a PR.
- Do not run two agents on the same files in the same worktree.
- The parent verifies the subagent's work; a subagent's prose is not evidence.

## Merge policy

- `integrator` runs `node scripts/merge-pr.mjs`.
- The helper allows only `develop` and `staging` as bases, requires every
  required check to be `SUCCESS`, and refuses drafts, conflicts, behind
  branches, `do-not-merge`/`wip`/`blocked` labels and any PR targeting `main`.
- It re-fetches the PR immediately before merging and refuses if the base or
  head commit changed; it verifies the base again after merging. A missing
  branch-protection check list fails closed.
- `develop` and `staging` require zero approvals so Karl or the integrator can
  merge them after checks. Karl may also push directly for small changes.
  `main` requires one owner approval and is never merged by an agent.
- `Issue policy` runs from the base branch and does not execute PR code. It is
  advisory on `develop` and `staging`; main is gated by owner approval.
- Never use `--admin`, `--auto`, force-push or branch deletion to get around a
  refusal.
- GitHub branch protection is the enforcement layer. If it still requires a PR
  on `develop`/`staging`, Karl uses a PR or the owner relaxes that setting; these
  docs do not override GitHub settings.

## Example prompts

```text
Use the reviewer subagent to review PR #42. Do not edit anything.
Use the release-manager subagent to prepare v0.3.0 from develop.
Use the integrator subagent to merge all green PRs into develop and staging.
```

## Handoff report

Every subagent report must state:

1. objective and issue;
2. worktree, branch and commit;
3. files changed;
4. checks run and their actual results;
5. blockers or refusals;
6. the next executable step.

The parent records verified facts separately from estimates.

## Limits

Subagents share the same machine and repository budget. Run light work in
parallel; run heavy builds, installs and browser suites one at a time. Do not
kill another agent's process. Do not use a subagent to bypass a permission, a
deployment rule or a blocked decision.
