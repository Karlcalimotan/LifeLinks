# Agent collaboration

This repository uses a small, bounded multi-agent workflow. The goal is not more
agents; it is a clear owner, a traceable issue, an isolated worktree and an
independent check.

## Roster

| Agent | Mode | Responsibility | Hard limit |
| --- | --- | --- | --- |
| parent / orchestrator | primary | Owns the issue, scope, worktree, verification and final report | Does not bypass checks or merge `main` |
| `reviewer` | subagent | Read-only review for correctness, safety, regressions and missing tests | Cannot edit, push or merge |
| `release-manager` | subagent | Version bumps, changelog sections and release checks | Cannot push, tag, merge, deploy or touch `main` |
| `integrator` | subagent | Merges PRs into `develop` and `stage` after every required check passes | Cannot merge `main` or bypass protection |

The definitions live in `.opencode/agents/`. OpenCode discovers them from the
project. If a newly added agent does not appear, run `opencode reload` or restart
the background service.

## Issue-first

1. Before any bug fix, update or feature, create a GitHub issue from
   `.github/ISSUE_TEMPLATE/task.md` or `bug.md`.
2. Put the objective, scope, acceptance criteria and test plan in the issue.
3. Link it in the PR body with `Closes #N`, `Fixes #N`, `Refs #N` or
   `Part of #N`.
4. The `Issue policy` check enforces this. Bot PRs and PRs labelled `release` or
   `promotion` are exempt.

The issue is the durable task record. A conversation is not a task record.

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
- The helper allows only `develop` and `stage` as bases, requires every
  required check to be `SUCCESS`, and refuses drafts, conflicts, behind
  branches, `do-not-merge`/`wip`/`blocked` labels and any PR targeting `main`.
- `develop` and `stage` require zero approvals so the integrator can promote
  them after checks. `main` requires one approval and is human-only.
- Never use `--admin`, `--auto`, force-push or branch deletion to get around a
  refusal.

## Example prompts

```text
Use the reviewer subagent to review PR #42. Do not edit anything.
Use the release-manager subagent to prepare v0.3.0 from develop.
Use the integrator subagent to merge all green PRs into develop and stage.
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
