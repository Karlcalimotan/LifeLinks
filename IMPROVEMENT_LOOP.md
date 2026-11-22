# LifeLink Improvement Loop

> **For the AI agents:** This file defines how you continuously check and improve the whole LifeLink system: backend, frontend, UX, and visual design. Read it fully. The goal is a product that looks and behaves like it was built by an experienced human product team, not generated.
>
> CI, PR policy and repo configuration are DONE. Do not work on them again unless a build is broken. Every cycle must change something a user can see or use.

---

## 1. Roles

| Role | Job | Rules |
|---|---|---|
| **Lead** (orchestrator) | Runs the loop, scores the system, picks tasks, delegates, owns architecture (data model, device API, permissions) | Does not implement everything. Delegates in parallel. |
| **Builder** (collaborator) | Implements UI and feature tasks from `TASKS.md` | Proactive: claims the next task without being asked. |
| **Reviewer** (design and quality critic) | Reviews every PR with fresh eyes, runs the slop checklist, passes or fails with evidence | Read-only on code. Never reviews its own work. Run it in a separate, fresh session so it is not biased by the build. |

If there is no third agent, run the Reviewer prompt in a new session of the same agent.

---

## 2. State files (the loop's memory; agents reread these every cycle)

```
TASKS.md                 shared task queue (claim before starting)
LOOP_STATE.md            current cycle number, last scorecard, what was done, what is next
docs/design-system.md    tokens and component rules (created in Cycle 0)
docs/current-state.md    short description of stack, data model, pages
reports/cycle-N.md       scorecard + findings for each cycle
reports/screens/         screenshots (desktop 1440x900, mobile 390x844) per page per cycle
CHANGELOG.md             user-visible changes, one line each
```

---

## 3. Cycle 0 (one time, before the loop starts)

1. **Baseline.** Run the app locally. Capture screenshots of every page (Dashboard, Vehicles, Incidents, Trackers, Settings) at desktop and mobile. Write `scripts/snapshot.mjs` (Playwright) so this is one command.
2. **Current state.** Write `docs/current-state.md`: stack, data model, routes, how data reaches the UI, what is mocked.
3. **Design system.** Write `docs/design-system.md` and implement it as design tokens (CSS variables or Tailwind theme). Required content:
   - **Type:** one sans family plus one mono family (for MAC, IDs, coordinates). A scale of at most 6 sizes. Numbers use tabular figures.
   - **Spacing:** 4 px base scale. No arbitrary values.
   - **Color:** neutral surface scale (3-4 steps), one brand accent (orange) used ONLY for the primary action and active navigation, and semantic colors used ONLY for status (online, offline, warning, critical, success). Every text/background pair at least 4.5:1 contrast.
   - **Radius and elevation:** one radius scale (e.g. 4 / 6 / 8), at most 2 shadow levels, borders do most of the work.
   - **Icons:** one icon set (Lucide), one size per context.
   - **Components:** button (primary / secondary / ghost / destructive), input, select, badge, table, drawer, modal, toast, empty state, skeleton, tooltip. Each with all states: default, hover, focus, disabled, loading, error.
4. **Realistic seed data.** Replace obviously fake data (`AA:BB:CC:DD:EE:01`, "Spare tracker") with believable data for the target market: real-looking Espressif MAC prefixes, local plate formats, local place names and coordinates, a mix of online / offline / low battery / never seen, incidents in every workflow state, timestamps spread over days. A demo that looks real is the first thing that makes the product feel professional.
5. **Scripts.** Create `scripts/snapshot.mjs`, `scripts/design-lint.sh` (section 11), and add axe accessibility and Lighthouse checks to the verify script.
6. Write `reports/cycle-0.md` with the first scorecard (section 5). Commit.

**STOP.** Tell the human the baseline scores and the top 5 problems. Then start the loop.

---

## 4. The loop (one cycle = one measurable improvement)

```
 1 SENSE     run the app, screenshots, tests, axe, Lighthouse, logs, error rates
 2 SCORE     score every dimension 0-5 with evidence (section 5)
 3 PICK      lowest score x highest user impact -> 1 to 3 tasks in TASKS.md
 4 DELEGATE  Lead hands tasks to Builder with the handoff format; Lead keeps the architectural one
 5 BUILD     one task = one branch = one PR, tests included
 6 VERIFY    verify script + new screenshots + axe + Lighthouse, compare to baseline
 7 REVIEW    Reviewer runs the quality gates (sections 6-8). Fail = back to BUILD, max 2 rounds
 8 SHIP      merge, update CHANGELOG.md, LOOP_STATE.md, reports/cycle-N.md
 9 REPEAT    start the next cycle from SENSE
```

**Rules of the loop**
- Every cycle must produce a visible or measurable user-facing improvement. A cycle that only changes config or process is invalid.
- Fix the lowest-scoring dimension first. Do not keep polishing what is already a 4.
- Keep changes small. No full redesigns in one PR. Roll out the design system page by page.
- Do not rewrite code that works. Improve it in place.
- Do not invent features outside the product scope (crash response: trackers, vehicles, incidents, alerts). New ideas go to `TASKS.md` as TODO, not straight into code.
- Never touch `.github/` or repo policy.
- Always use the design tokens. No raw hex colors, no magic spacing numbers.
- Report to the human every 3 cycles: scores before and after, what changed, what is blocked.

---

## 5. Scorecard (score each 0-5 per cycle, write evidence for each)

| Dimension | 5 looks like |
|---|---|
| **Function** | Every button does something real; all main flows work end to end; no mock data in production paths |
| **Workflows / UX** | A new operator completes register tracker, approve, assign, and handle incident without help, in few clicks |
| **Visual design** | Passes the slop gate (section 6); consistent; clear hierarchy; looks hand-crafted |
| **States** | Loading, empty, error, partial, offline and permission states exist on every screen |
| **Accessibility** | axe: zero serious issues; keyboard-only works; contrast 4.5:1; focus visible; labels on all inputs |
| **Responsive** | Usable at 390 px: tables become cards or scroll with a pinned first column; no horizontal page scroll |
| **Performance** | Lighthouse performance 90+ on main pages; no layout shift; lists paginated |
| **Backend / data** | Validated inputs, auth on every route, RLS or equivalent, idempotent device endpoints, rate limits, indexes |
| **Reliability / observability** | Structured logs, error tracking, health endpoint, graceful failures, retry on alert delivery |
| **Code and tests** | Typed, no dead code, logic tested, components reusable |

**Stop condition:** all dimensions at 4 or higher for two cycles in a row, or the human says stop.

---

## 6. Design quality gate: "AI slop" remover

The Reviewer fails any PR that contains these tells. Check every changed screen at desktop and mobile.

**Visual tells (remove)**
- Purple or blue to pink gradients, gradient text, glowing shadows, glassmorphism and heavy blur used as decoration
- Everything with the same large radius (`rounded-2xl`/`3xl`), or cards inside cards inside cards
- A grid of identical cards when a table or list would be clearer
- Emoji used as icons, mixed icon styles, decorative blobs, stock illustrations
- Many font sizes or weights, ALL CAPS labels everywhere, tiny low-contrast gray text (under 12 px or under 4.5:1)
- Color used as decoration. Color must mean something (status or the one primary action)
- Animation for its own sake: bouncing, floating, long fades. Motion only for state change, 120-200 ms

**Layout tells (fix)**
- Huge padding with little information; the screen should be as dense as an operations tool needs
- Full-width stacked forms taking half the page (use a drawer or modal)
- No clear primary action per screen; no clear page hierarchy
- Misaligned edges, uneven gaps, inconsistent spacing between sections

**Copy tells (rewrite)**
- Marketing words: "seamless", "unlock", "elevate", "streamline", "empower", "supercharge", "revolutionize", "effortless"
- "Welcome back!", exclamation marks, "Oops!", "Something went wrong"
- Placeholder names and data: lorem ipsum, John Doe, AA:BB:CC, test, asdf
- Copy must be specific and calm: "No trackers match 'navara'. Clear filters." / "Tracker not seen for 4 days. Check power and SIM."

**Human craft signals (add)**
- Restraint: neutral surfaces, one accent, status colors only for status
- Tabular numbers for numeric columns, monospace for MAC/IDs with a copy button
- Absolute time on hover for relative times ("4 days ago" shows the exact timestamp)
- Truncation with tooltip, sticky table headers, row hover, selected row state
- Keyboard shortcuts for frequent actions, `/` focuses search
- Consistent patterns: the same table, same filters, same drawer across all pages
- Confirmation on destructive actions, toast after every action, undo where possible
- Optimistic updates for quick actions, skeletons that match the real layout
- Realistic data (Cycle 0, step 4)

**Mechanical checks:** run `scripts/design-lint.sh` (section 11). Then the Reviewer opens the screenshots and compares them against this list line by line, writing the evidence in the review.

---

## 7. UX gate (every flow)

- Can the user finish the task in the fewest steps? Count the clicks and write the number.
- Is the next action obvious? Is the primary button unmistakable?
- Does every list have: search, filters, sort, pagination, empty state, loading state, error state, row actions, bulk actions where useful?
- Does every form have: inline validation, clear error text, disabled submit while saving, success feedback, keyboard submit?
- Is each status explained? (What does Pending mean? What happens after Approve?) Add short helper text or tooltips.
- Are dangerous actions guarded and logged in an audit trail?
- Does the screen work during slow or lost network? (Show stale data with a banner, not a blank page.)
- Is language selection working (EN is shown, so the UI is translatable): no hardcoded strings.

---

## 8. Backend and system gate

- Every route checks authentication and role on the server. Database-level security (RLS) matches.
- All input validated with a schema (zod). Errors return consistent JSON with codes.
- Device endpoints: per-device token, HMAC or signed requests, idempotency key, rate limit, payload size limit, clock-skew tolerance.
- Online/offline computed from last heartbeat with a configurable threshold; low battery flag from a threshold.
- Incident workflow is a state machine with allowed transitions, timestamps and actor on each change.
- Alert delivery has retry with backoff, delivery status, and a visible failure state.
- Indexes on filtered and sorted columns; no N+1 queries; pagination server-side.
- Structured logs with request IDs, error tracking (Sentry or similar), `/api/health`.
- Audit log for approvals, deletions, role changes.
- Tests for the API, state machine and permissions. Seed and migration scripts are repeatable.

---

## 9. Cycle 1 candidates (from the current Trackers page)

What the Trackers page shows now and what to improve first:

1. **Registration form takes half the page.** Replace with a "Register tracker" button that opens a right-side drawer. Validate MAC format and duplicates inline; show the format hint and a paste-friendly input.
2. **No way to act on a tracker.** Add a row actions menu: Approve, Reject, Edit, Reassign vehicle, Rotate device token, Delete (with confirmation and audit entry). Pending rows get a clear inline Approve button.
3. **No search, filter, sort or pagination.** Add a toolbar: search (label, MAC, plate), filters (Approval, Connection, Vehicle assigned, Low battery), sortable headers, server-side pagination, result count.
4. **Redundant status chips.** Merge connectivity into one Status column (Online / Offline / Never seen) with the exact last-seen timestamp on hover; keep Approval as a separate column. Remove the stacked pill under the label.
5. **Battery is just a number.** Show a small battery indicator with a threshold color and the voltage in tabular numbers; flag low battery.
6. **Firmware column is plain.** Show version and an "update available" marker; link to rollout status.
7. **Label is an orange link.** Reserve orange for the primary action and active navigation; make labels neutral with a hover underline and link them to a tracker detail page.
8. **MAC and ID formatting.** Monospace, copy-on-click, uppercase, consistent grouping.
9. **Summary header.** Add counts under the title ("3 trackers: 2 approved, 1 pending, 2 offline") and a pending-approvals callout when there are any.
10. **Seed data.** Replace the fake MACs and generic labels with realistic data and a healthy mix of statuses.

Then repeat the same treatment for Vehicles, Incidents (map and timeline), Dashboard (live KPIs, map), and Settings.

---

## 10. Prompts

### Lead (orchestrator)

```
You are the Lead engineer on LifeLink (crash response platform: web app + ESP32 trackers).
The hardware is handled by a teammate; you own the product.

Read IMPROVEMENT_LOOP.md fully and run it.
- If reports/cycle-0.md does not exist, do Cycle 0 now.
- Otherwise read LOOP_STATE.md and continue with the next cycle.

Hard rules:
- Do NOT work on CI, PR policy or repo configuration. That is finished.
- Every cycle must change something a user can see or use.
- Delegate. Hand independent tasks to @builder using the handoff format below,
  in parallel, and keep architecture work (data model, device API, permissions) yourself.
  Never let the builder sit idle: when it reports back, give it the next task.
- Nothing merges without a Reviewer pass. Start a fresh Reviewer session for every PR.
- Update TASKS.md, LOOP_STATE.md, CHANGELOG.md and reports/cycle-N.md every cycle.
- Send the human a short status every 3 cycles: scores before/after, shipped, blocked.

Handoff format:
  TASK: <id and title>
  GOAL: <what the user can do after this>
  FILES LIKELY TOUCHED: <paths>
  ACCEPTANCE CRITERIA: <3-5 checkable bullets>
  DESIGN RULES: use docs/design-system.md tokens, pass section 6 of IMPROVEMENT_LOOP.md
  DO NOT TOUCH: <files owned by someone else>
  REPORT BACK: branch, what changed, how tested, screenshots (desktop and mobile)

Start now. First action: read the repo and IMPROVEMENT_LOOP.md, then begin the work.
```

### Builder (collaborator)

```
You are the Builder on LifeLink. You are proactive: never wait to be asked.

Loop until TASKS.md has no TODO left:
1. Read TASKS.md. Take the highest-priority TODO not claimed (tasks assigned to you first).
2. Set it to CLAIMED:builder and commit that change.
3. New branch. Implement it using docs/design-system.md tokens only.
   Add loading, empty, error states, keyboard support, and mobile layout as part of the task.
4. Run the verify script, scripts/design-lint.sh, and scripts/snapshot.mjs.
   Attach desktop and mobile screenshots to the PR.
5. Open the PR. Set the task to IN REVIEW. Immediately go back to step 1.

If a Reviewer sends a fail, fix exactly what it lists and resubmit.
If the queue is empty, do not idle: run a SENSE pass on one page, add the biggest
problems to TASKS.md and start on the best one.
Never touch .github/, repo policy, the database schema or the device API without the Lead's approval.
Write blockers in TASKS.md and switch to another task instead of waiting.
```

### Reviewer (fresh session, read-only)

```
You are the Reviewer for LifeLink. You did not write this code. Your job is to find
what is wrong, not to be agreeable.

Review the given PR against IMPROVEMENT_LOOP.md sections 6, 7 and 8.
1. Run the app and the verify script. Open the screenshots at desktop and mobile.
2. Go through the slop checklist (section 6) line by line. Quote the evidence for each failure
   (file and line, or the screen and element).
3. Go through the UX gate (section 7) and backend gate (section 8) for what the PR touches.
4. Check against docs/design-system.md: raw colors, magic spacing, new fonts, new icon styles.
5. Output exactly:
   VERDICT: PASS or FAIL
   BLOCKERS: numbered list, each with evidence and the exact fix
   NITS: optional list
   SCORES: the affected dimensions, before and after
If FAIL, the Builder fixes and you review again. After 2 failed rounds, escalate to the Lead.
Do not edit code yourself.
```

---

## 11. Helper scripts the agents should create

### `scripts/design-lint.sh`

```bash
#!/usr/bin/env bash
# Fails on common AI-slop tells in UI source. Adjust the src path to the project.
set -u
SRC="${1:-src}"
fail=0

check () {  # $1 = description, $2 = regex
  if grep -rEn --include='*.{ts,tsx,css,jsx,html}' "$2" "$SRC" >/tmp/lint.out 2>/dev/null && [ -s /tmp/lint.out ]; then
    echo "FAIL: $1"; head -5 /tmp/lint.out; fail=1
  fi
}

check "gradient decoration"        'bg-gradient|linear-gradient\(|text-transparent bg-clip-text'
check "glow / heavy shadow"        'shadow-2xl|drop-shadow-2xl|shadow-\[0_0'
check "oversized radius"           'rounded-3xl|rounded-\[(2[4-9]|[3-9][0-9])px\]'
check "glassmorphism"              'backdrop-blur'
check "marketing copy"             -i 'seamless|unlock|elevate|streamline|empower|supercharge|revolutioni[sz]e|effortless|oops'
check "placeholder data"           -i 'lorem|john doe|asdf|AA:BB:CC'
check "raw hex colors outside tokens" '#[0-9a-fA-F]{6}\b'
check "emoji in UI strings"        '[\x{1F300}-\x{1FAFF}]'

[ $fail -eq 0 ] && echo "design-lint OK"
exit $fail
```

(The agent should tune the patterns and exclusions, such as allowing hex values inside the tokens file, so the script passes on correct code and fails on slop.)

### `scripts/loop.sh` (optional: run cycles unattended)

```bash
#!/usr/bin/env bash
# Runs N improvement cycles. Each cycle is a fresh session, so context stays small
# and all memory lives in the state files. Check `opencode run --help` for your version's flags.
set -u
N="${1:-3}"
for i in $(seq 1 "$N"); do
  echo "=== cycle $i of $N ==="
  opencode run "Read IMPROVEMENT_LOOP.md and LOOP_STATE.md. Run exactly one cycle as the Lead. Update the state files. Stop after the cycle."
  opencode run "You are the Reviewer. Read IMPROVEMENT_LOOP.md. Review the newest open PR as specified in the Reviewer prompt."
done
```

Run with a small N first (2 or 3) and read the PRs before raising it. Unattended loops still need you to merge.

---

## 12. Anti-patterns (the agents must avoid)

- Spending cycles on CI, linting config, repo policy or documentation instead of the product
- Changing many pages at once, or redesigning from scratch
- Adding features no one asked for to look busy
- Marking a task done without screenshots and a Reviewer pass
- Making the UI look "modern" by adding gradients, blur and animation
- Silent scope creep into the database schema or device API without the Lead's approval
- Self-review: the agent that built it must not approve it
