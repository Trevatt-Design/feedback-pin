---
name: fp-next
description: Pull the next queued item from manifest.yaml#roadmap and run it through fp-feature. Designed to be wrapped by /loop for autonomous batch-shipping ("/loop /fp-next") so the user can queue a backlog and walk away. Halts the loop on any pipeline stop condition or on a recent decisions.log reversal. Does not duplicate any pipeline work — pure orchestration on top of fp-feature.
---

# fp-next — autonomous roadmap dispatcher

Thin orchestration layer on top of `fp-feature`. One invocation picks the next queued item from `manifest.yaml#roadmap`, marks it in-progress, hands it to the full pipeline, and either flips it to `done` or leaves a `halt_note:` explaining where things stopped.

Designed to be wrapped by `/loop` so the user can fire `/loop /fp-next`, walk away, and return to a stack of shipped work. The loop self-paces and terminates cleanly on `queue empty` or any halt.

## When to use

- The user types `/fp-next` (single iteration) or `/loop /fp-next` (run-until-queue-empty-or-halt).
- Never invoke from inside another pipeline run. fp-next is an entry point, not a sub-stage.

## Inputs

Read at startup:

- `manifest.yaml` — for the `roadmap:` array.
- `decisions/<current-month>.log` — for the pre-flight reversal scan.

That's it. fp-feature itself reads everything else when it's invoked in step 4.

## Recipe

Run these steps in order. Stop at the first one that returns a halt.

### 1. Pre-flight reversal check

Read `decisions/<current-month>.log` (and the previous month's bucket if today is within the first 24h of a new month). Scan every entry whose date is within the last 24h. If any of those entries is tagged with `reversal: true` or carries a `reverses: <id>` field, **halt**:

```
halt: recent reversal in decisions log

  2026-05-04 | feature-id | decision | rationale (reversal: true, reverses: 2026-05-03)

Resolve the reversal direction with the user before queueing more work.
```

Convention is documented in `decisions/README.md`. If no entries in the last 24h carry the flag, proceed.

> **Note on log format.** Today's decision entries are pipe-delimited single lines. Reversal flags ride on the rationale field: append `(reversal: true, reverses: <id>)` at the end. fp-next greps for the literal string `reversal: true` within entries dated within 24h.

### 2. Pick the next item

Parse `roadmap:` from `manifest.yaml`. Filter to entries with `status: queued`. Sort by `priority` ascending (lower number = higher priority); ties break on `queued_on` ascending (older first). Pick the first.

If no queued items remain, **halt cleanly**:

```
queue empty — roadmap has no `status: queued` entries.
```

Cleanly is the operative word: this is a successful loop termination, not a failure.

### 3. Mark in-progress

Single Edit to `manifest.yaml`: flip the chosen item's `status:` from `queued` to `in-progress`. Add `started_on: <YYYY-MM-DD>` if not present. Do not touch any other field. Save immediately so a crash mid-run leaves a recoverable trail.

### 4. Invoke fp-feature

Hand the item's `brief:` field to the fp-feature skill as the user prompt. If the item has a `weight:` field (`lightweight` or `full`), pass it through; otherwise let Stage 1b classify.

Tag the invocation with the roadmap item's `id` so the integrator (Stage 7) can find the corresponding roadmap entry to flip in step 5.

### 5. On success — finalize the roadmap entry

fp-feature's integrator already updates `features:`, `decisions/<month>.log`, `invariants.map.yaml`, `followups.yaml`, and writes the verification report. fp-next's only post-pipeline edit:

- Set the roadmap item's `status: done`
- Add `shipped_on: <YYYY-MM-DD>`
- Prune any `status: done` items older than 14 days (keep recent ones for at-a-glance history)

Then return `next` so the loop continues.

### 6. On any halt from fp-feature

If fp-feature hands back at any stage (drift, conflict, blocking review, ambiguous brief, red tests), do **not** flip the roadmap item to done. Instead:

- Leave `status: in-progress`
- Append a `halt_note:` field with: stage that halted, one-line summary, and a pointer to the report or log line where details live
- Return `halt: <reason>` to the loop

Example halt note appended to the roadmap entry:

```yaml
halt_note: |
  Halted at fp-feature Stage 2 (conflict scan): brief touches anti-feature
  af-cms-edit ("Auto-edit the host site's DOM").
  See decisions/2026-05.log entry for 2026-05-04.
```

The user resolves halts manually: revise the brief, re-set `status: queued`, or remove the item entirely. The loop ends here.

## Roadmap entry schema

The user (or anyone) appends entries to `manifest.yaml#roadmap` in this shape:

```yaml
roadmap:
  - id: r-2026-05-04-01           # required, unique. Format: r-YYYY-MM-DD-NN.
    title: Inline pin replies     # required, short label.
    priority: 10                  # required, lower = higher.
    status: queued                # required: queued | in-progress | done.
    queued_on: 2026-05-04         # required, set when adding the item.
    brief: |                      # required. The brief that fp-feature receives.
      Allow viewers to reply to a pin from the dashboard sidebar without
      opening the detail panel...
    weight: standard              # optional: lightweight | full. Auto-classified if absent.
    notes: |                      # optional. Context for future-you, not for the pipeline.
      ...
    started_on: ~                 # written by fp-next when it begins step 3.
    shipped_on: ~                 # written by fp-next on success.
    halt_note: ~                  # written by fp-next on any halt.
```

The schema is enforced by convention; no validator runs over it. Keep it stable so future tooling can lean on it.

## Things this skill must refuse

- **Editing application code.** That's engineer territory — and only inside fp-feature.
- **Editing tests.** Same — test agent only.
- **Skipping the pre-flight reversal check.** It is the only safety net the user explicitly asked for.
- **Auto-resolving halts.** A halted item stays halted until a human edits its `status:` back to `queued`.
- **Running when called from inside another pipeline.** fp-next is an entry point only.

## Output

Return one of three states to the wrapping loop:

| State          | Meaning                                                            |
|----------------|--------------------------------------------------------------------|
| `next`         | Item shipped. Loop should continue.                                |
| `queue empty`  | No queued items remain. Loop should terminate (success).           |
| `halt: <why>`  | Pipeline halted or pre-flight blocked. Loop should terminate.      |

Always print a one-paragraph summary before the state token so the user has a scannable trail when they come back: which item was picked, what fp-feature did, where any halt occurred, where the verification report lives.
