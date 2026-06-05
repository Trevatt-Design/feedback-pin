# decisions/

Append-only month-bucketed decision log. Replaces the root `decisions.log`
(which now serves as the historical archive — never appended to again).

## Why bucketed

The pipeline reads decisions on every run. With a single growing log, every
new entry costs slightly more in context for the rest of the project's life.
Month buckets cap that: only the current month (and previous month, if it
exists) load by default. Older months are searchable but not auto-loaded.

## File naming

```
decisions/2026-05.log
decisions/2026-06.log
...
```

## Format

One line per decision. Same format as the legacy `decisions.log`:

```
YYYY-MM-DD | feature-id | decision | one-line rationale
```

## Reversal flag

When a new entry contradicts or undoes a prior decision, append
`(reversal: true, reverses: <prior-id-or-date>)` to the rationale field.
Example:

```
2026-05-05 | wrapper-toolbar | revert tablet glyph reinstatement | UX confirmed two-glyph switcher reads cleaner (reversal: true, reverses: 2026-05-04)
```

The `fp-next` orchestrator scans entries dated within the last 24h for the
literal string `reversal: true` as a pre-flight check. If found, the autonomous
loop halts before invoking `fp-feature` — the user must explicitly resolve the
direction before more work auto-ships. See `.claude/skills/fp-next/SKILL.md`.

## Who writes

The integrator agent (Stage 7 of the fp-feature pipeline) appends to the
current month's bucket. Human edits should be rare — a reversal flag added by
hand is one of the few legitimate cases.

## Reading older months

```bash
grep "feature-id" decisions/*.log decisions.log
```
