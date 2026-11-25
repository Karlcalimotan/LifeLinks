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
- Agents open PRs to `develop`. Karl may use `develop` and `staging` directly for
  small changes; `main` is PR-only, owner-approved and never merged by an agent.
- Hardware bring-up and bench tests belong to the human hardware owner (Jeff).
  The agent may write and test code, but must not power, wire or flash the
  device.

## Task records

- Issue-first is recommended, not required, for feature, `develop` and `staging`
  work. A clear PR description is enough for a small change; use an issue for
  multi-day or cross-team work.
- Run `pnpm overlap:check` before starting to avoid duplicate work. If J-Akiru5's
  issue or PR already covers the task, coordinate on it instead of creating a
  duplicate. Do not take over an issue assigned to someone else.
- Main-bound release PRs require the owner's approval and release notes; they do
  not require a separate issue.
- The `Issue policy` check is advisory on `develop` and `staging`. `main` remains
  owner-approved.

## Workflow

1. Agents work on feature branches. Karl may work directly on `develop` or
   `staging` for small changes; `main` is always a PR.
2. Small changes, one concern per PR (or direct commit for Karl).
3. Feature PRs target `develop`. Karl may merge his own green PRs without a
   separate approval.
4. Promote `develop` to `staging` after checks pass. `staging` is the preview;
   `develop` is the reconciliation gate and does not deploy.
5. Promote `staging` to `main` through a versioned release PR. Only the human
   owner approves and merges `main`; agents never merge `main`.
6. Run `bash scripts/verify.sh` before finishing.
7. Commit often.
8. The firmware version is independent of the application/PWA version. Bump
   `FW_VERSION` only when the firmware changes.

## Agent collaboration

- `reviewer` is a read-only reviewer. It cannot edit, push or merge.
- `release-manager` prepares version bumps and changelog sections. It cannot
  push, tag, merge, deploy or touch `main`.
- `integrator` merges PRs into `develop` and `staging` only after every required
  check passes. It uses `node scripts/merge-pr.mjs` and cannot merge `main`.
- The parent agent owns the issue, worktree, scope, verification and final
  report. It verifies subagent work instead of trusting a report.
- One task, one worktree, one branch. An issue is optional. Never edit another
  agent's worktree.
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
