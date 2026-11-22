# Vehicle Crash Alert

ESP32 DevKit V1 firmware: detects a crash (MPU-6050 + SW-420), gets position
(NEO-6M), sends an alert over 4G (A7670E) unless the driver presses Cancel
within the countdown.

This repository also contains the LifeLink web console and device API. Firmware
work stays under `firmware/`; do not change `apps/web/` unless the task
explicitly spans both.

## Repository layout

- `firmware/` — PlatformIO project. `firmware/main/` holds the sketch and the
  Arduino-free headers, `firmware/include/` holds the pin map and the optional
  secrets template, `firmware/test/` holds the host-native Unity tests.
- `apps/web/` — Next.js console and device API.
- `docs/` — architecture, wiring, safety, runbook.
- `scripts/verify.sh` — the firmware gate.

## Goal

Make this firmware reliable, testable, automated and maintainable at enterprise
grade.

## Hard rules

- NEVER change pins. Pins live only in `firmware/include/pins.h` and must match
  `docs/wiring.md`. If a change needs a different pin, stop and ask the human.
- No secrets (APN, phone numbers, API keys) in code. Use `secrets.h` (gitignored)
  plus `secrets.example.h`. Runtime provisioning goes to NVS.
- No blocking `delay()` in the main loop. Use a non-blocking state machine.
- Every modem/GPS call has a timeout and retry with backoff. Never hang.
- Enable the hardware watchdog. A hung device must reboot itself.
- Crash logic must be pure functions (no hardware calls) so it can be unit
  tested.
- Never flash hardware, never push to main, never change CI secrets.
- `develop` and `stage` are PR-only protected branches. Do not push directly to
  them.
- Hardware bring-up and bench tests belong to the human hardware owner (Jeff).
  The agent may write and test code, but must not power, wire or flash the
  device.

## Issue-first workflow

1. Before creating an issue or starting work, run `pnpm overlap:check` to list
   J-Akiru5's open issues and pull requests. If an item already covers the task,
   coordinate on it instead of creating a duplicate. Do not take over an issue
   assigned to someone else. If there is an overlap decision, J-Akiru5's
   decision takes priority: pause the conflicting work, comment on his issue or
   PR, and align with his design instead of merging a competing one.
2. Create a GitHub issue from `.github/ISSUE_TEMPLATE/`.
3. Put the objective, scope, acceptance criteria and test plan in the issue.
4. Open the PR against `develop` and link the issue with `Closes #N`,
   `Fixes #N`, `Refs #N` or `Part of #N`.
5. The `Issue policy` check enforces this. Do not start work without an issue.

## Workflow

1. Work on a new feature branch; never work directly on `main`, `stage` or
   `develop`.
2. Small changes, one concern per PR.
3. Open feature PRs against `develop`.
4. Promote `develop` to `stage` through a PR after the checks pass.
5. Promote `stage` to `main` through a versioned release PR. Only the human
   owner merges `main`.
6. Run `bash scripts/verify.sh` before finishing.
7. Commit often.

## Agent collaboration

- `reviewer` is a read-only reviewer. It cannot edit, push or merge.
- `release-manager` prepares version bumps and changelog sections. It cannot
  push, tag, merge, deploy or touch `main`.
- `integrator` merges PRs into `develop` and `stage` only after every required
  check passes. It uses `node scripts/merge-pr.mjs` and cannot merge `main`.
- The parent agent owns the issue, worktree, scope, verification and final
  report. It verifies subagent work instead of trusting a report.
- One task, one issue, one worktree, one branch. Never edit another agent's
  worktree.
- See [`docs/agents.md`](docs/agents.md) for the full protocol.

## Done means

verify passes, and the PR lists what changed, why, and how it was tested.

## Hardware facts to respect

- A7670E needs short ~2A bursts on transmit: the 5V rail has a 1000uF cap. Do
  not add features that raise idle current.
- Cancel button is active LOW with INPUT_PULLUP.
- GPIO 0/2/5/12/15 are strapping pins: do not use them.
- The SW-420 and MPU-6050 are vibration sensitive: tune thresholds to avoid
  false alarms from potholes.
