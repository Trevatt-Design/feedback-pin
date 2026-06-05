---
name: fp-feature
description: Run a feedback-pin feature change through a multi-agent pipeline. Use whenever the user asks to add, change, or remove functionality. Composes existing skills (shape, security-review, audit, adapt, critique, simplify, harden, verify-before-fix, review, polish) with three thin custom agents (engineer, test, integrator). Always reads manifest.yaml first; updates it last.
---

# fp-feature — feedback-pin feature pipeline

A bounded pipeline for changing this project. The user supplies a brief; the skill runs it through existing specialist skills + thin custom agents, and produces a code change with tests, an updated manifest, and a verification report.

This skill is **the only correct way** to add or modify functionality in feedback-pin while it is still in wireframe-as-code phase. Do not bypass it. If it is too heavy for a particular change, use the **lightweight** weight (defined below) — that's the supported way to be cheaper without skipping the pipeline.

## Inputs

The brief from the user. May be one sentence ("add a checkmark animation to the share button") or a paragraph. The pipeline clarifies what is missing.

When invoked by `/fp-next` (autonomous batch mode), the brief comes from a `roadmap:` entry in `manifest.yaml` rather than the user. The orchestrator passes the originating roadmap item's `id` so Stage 7 can flip its `status:` to `done` on success. See `.claude/skills/fp-next/SKILL.md`.

**Read these files once at orchestrator startup, then pass only the relevant excerpts down to subagents** (do not pipe the full files into every subagent — see "Excerpt rule" below):

- `manifest.yaml` (root) — current features, contracts, anti-features, conflicts
- `decisions/<current-month>.log` and `decisions/<previous-month>.log` if it exists — recent decisions. The historical archive at root `decisions.log` is read **only** when a feature explicitly references something older.
- `invariants.map.yaml` (root) — invariant name → `<file>:<line>` source links for the drift check
- `followups.yaml` (root) — open deferred items, interim-decision review queue
- `PLAN.md`, `PLAN-v2.md` — strategic context; usually read once and summarised, not re-read per stage

### Excerpt rule

Subagents (engineer, test, integrator) get **only the manifest entries for the surfaces their change touches**, not the whole file. The orchestrator selects:

- All `features:` entries whose `surface:` matches a touched surface
- All `anti-features:` (always — they are global gates)
- A one-line strategy summary

This typically reduces the per-dispatch context by a factor of 5–10× on a manifest of any maturity.

## Pipeline

Run stages in order. Stop and surface to the user only at the explicit hand-back points marked **HAND BACK**.

### Stage 0 — Pre-flight drift check

Before reading the brief, verify that `manifest.yaml` is in sync with the code that's actually shipped. Reasons drift accumulates: external commits land between pipeline runs, hot-fix patches happen outside the pipeline, schema migrations.

The drift check:

- Every entry in `invariants.map.yaml` resolves: file exists, named line still contains the expected anchor pattern (or, if no anchor was recorded, the file is not deleted)
- Every `features[*].tests` path exists
- Every `features[*].surface` resolves to a real directory
- No grep-able anti-feature pattern (see manifest `anti-features[].statement`) appears in code

If drift is detected, **HAND BACK** with a list of what's stale and a one-line "absorb into this brief OR open a separate reconciliation batch?" question. Drift discovered mid-implementation triggers a re-run of Stage 2 (per "Failure modes" below); drift discovered at the start triggers this hand-back.

### Stage 1 — Brief intake (skill: `shape`)

Invoke `shape` with the user's brief. `shape`'s job is to map the brief to a UX flow and surface gaps. Capture:

- Restated user need in one sentence
- Affected surfaces (widget / wrapper / dashboard / api / multiple)
- New UI elements vs existing ones (do not invent new elements if a contract exists)
- Edge cases worth listing
- Open questions

If `shape` returns open questions that genuinely block scoping, **HAND BACK** with those questions only — do not guess. Otherwise, proceed.

### Stage 1b — Weight classification

Decide whether this is **lightweight** or **full** weight. Default is full unless ALL of the following are true:

- Touched files are limited to: any `*styles.ts`, image / SVG asset files, single-token swap files (CSS variable values, hex codes), or copy strings inside markup that already exists
- No new manifest contract is added
- No existing invariant is removed
- No new endpoint, no schema migration, no auth surface change

A lightweight pipeline:

- **Skips Stage 3** (specialist parallel review) and replaces it with an inline checklist:
  - Contrast verified for any new colour against existing surfaces
  - No new dependencies
  - No new API endpoints / auth changes
  - Bundle delta documented (rough)
- **Skips Stage 6** (simplify / harden)
- Otherwise runs all stages exactly as full weight

The classification is recorded in the verification report so it's auditable.

### Stage 2 — Conflict scan (no skill, in-line check)

Open `manifest.yaml`. For the affected surface(s), list:

- Existing feature contracts in this surface
- Anti-features that the brief might violate
- Invariants that the change must preserve

If any anti-feature is triggered, **HAND BACK** with the conflict explicitly named. The user must either revise the brief, or amend the manifest (which is a separate, deliberate decision).

If there are no conflicts, write a short plan that names which existing contracts will change and which new ones will be added.

### Stage 3 — Specialist review of the plan (parallel) — full weight only

Invoke these in parallel against the plan from stage 2. Each returns either *pass* or a list of findings:

| Skill | Mandate within this change |
|---|---|
| `security-review` | Auth gates, input validation, data leakage, dependency risk, secrets handling |
| `audit` | a11y (keyboard, ARIA, contrast, focus, reduced-motion) + performance (bundle delta, runtime cost) + responsive |
| `adapt` | Browser/device/viewport compatibility, iframe context, CORS |
| `critique` | UX coherence with existing flows; copy clarity; audience fit (commenter / designer / buyer) |

Collect all findings into a single bullet list. If any are blocking (security or correctness), revise the plan before stage 4. Non-blocking findings are notes the engineer must address during implementation.

(Lightweight weight skips this stage entirely; the inline checklist from Stage 1b stands in.)

### Stage 4 — Implementation (custom agent: `engineer`)

Invoke the `engineer` agent (`.claude/agents/engineer.md`) with: the plan, the manifest entries to touch, the specialist findings, and a strict requirement to use `verify-before-fix` discipline whenever proposing a change to existing behaviour.

The engineer writes code only. It does not invent new contracts beyond what the plan permits. It does not write tests (that's stage 5). It does not update the manifest (stage 7). It must return a populated `verify_before_fix` array in its handoff if any existing behaviour was modified — the orchestrator rejects handoffs that omit it.

### Stage 5 — Tests (custom agent: `test`)

Invoke the `test` agent (`.claude/agents/test.md`). It must:

1. Add or update unit tests for any new pure logic
2. Add or update API/integration tests for any new endpoint or contract
3. Add or update e2e tests for any new user-visible flow
4. Run the full test suite and report results

A change cannot pass stage 5 unless every test in the suite is green.

### Stage 6 — Quality pass (skills: `simplify`, `harden`) — full weight only

Run `simplify` against the diff (looks for reuse and dead code) and `harden` (production-grade error states, edge cases, empty states). Apply non-controversial fixes; surface anything that needs a judgement call to the integrator in stage 7.

### Stage 7 — Integrator (custom agent: `integrator`)

Invoke the `integrator` agent (`.claude/agents/integrator.md`). It must:

1. Update `manifest.yaml` with new/changed feature entries; append to `invariants.map.yaml` for every new invariant
2. Append a single line to `decisions/<current-month>.log` for any genuine decision the pipeline made
3. Append entries to `followups.yaml` for: non-blocking findings the user should revisit, "interim" decisions (auto-create with `review_after: ~90d`), deferred fixes flagged by engineer or test
4. Run the full test suite **only if Stage 6 modified code since Stage 5's green run** (`git diff --quiet` skips it). Always note ran/skipped in the report.
5. Run the post-stage drift check (manifest ↔ code consistency, plus the new `invariants.map.yaml` line check)
6. If a preview deploy environment exists, deploy to it and capture the URL
7. Produce a one-page verification report with each stage's verdict, the chosen weight, and the conditional-rerun status
8. **If invoked via `/fp-next`** (a roadmap-item id was supplied), flip that `roadmap:` entry's `status:` to `done` and stamp `shipped_on:`. Otherwise skip — the manual entry path has no roadmap entry to update.

### Stage 8 — Final review (skill: `review`)

Run `review` against the diff. This is the last gate before **HAND BACK** to the user.

### Stage 9 — Hand back

Present the user with:
- One-paragraph summary of what changed and why
- The chosen pipeline weight (`lightweight` / `full`)
- The verification report from stage 7
- Preview URL if available
- Any non-blocking findings the user should know about
- Any new entries opened in `followups.yaml` (id + summary)

The user approves; the orchestrator does not auto-merge.

## What this skill does *not* do

- It does not decide on new anti-features. Adding to `anti-features:` is a manual edit by the user.
- It does not pivot product strategy. Strategic pivots edit `PLAN-v2.md` first, then features get planned around the new strategy.
- It does not bypass tests because they are inconvenient.
- It does not delete existing tests without surfacing the deletion in the report.
- It does not silently absorb manifest drift detected at Stage 0; that's always a hand-back.

## Failure modes and recovery

- **Stage 0 detects drift** → **HAND BACK** with the drift list. Do not proceed.
- **Stage 1 has blocking gaps** → **HAND BACK** with the questions only.
- **Stage 2 triggers an anti-feature** → **HAND BACK** with the conflict named.
- **Stage 3 returns blocking findings** → revise the plan and re-run stage 3 only. Do not regress to stage 1 unless the brief itself is wrong.
- **Stage 5 cannot turn the suite green** → stop. Do not weaken tests. Surface the failing test and the suspected cause.
- **Manifest conflict appears mid-implementation** → stop and re-run stage 2 with the new information.
- **A skill is unavailable** → surface to the user, do not silently skip it.

## Non-goals during wireframe-as-code phase

While we are in this phase, the pipeline does not enforce:

- Brand-perfect visual design
- Internationalisation
- Per-user accounts
- AI features (auto-edits to host site)

These are explicit anti-features in `manifest.yaml` and any brief that triggers them returns to stage 2 as a conflict.
