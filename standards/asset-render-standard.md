# Asset render standard — Let's Pepper

Read before rendering any asset here. Sets the model tier for the task and the gates that run at
every tier. Machinery: `~/.claude/hooks/render-dispatch-guard.py` and the tier agents at
`~/.claude/agents/render-{mechanical,standard,judged}.md`.

## Render work is dispatched, not done inline

**Rule R-0.** Name the tier, then dispatch. A main loop cannot change model mid-session, so an
inline render runs at whatever tier the session already had and the tiers below are inert.

> **Scope caveat — this repo's hook coverage is partial.** The dispatch hook recognizes `render-kit`
> invocations. Let's Pepper renders through its own scripts — `scripts/story-assets/render-*.mjs`,
> `scripts/apparel/render-apparel.mjs`, `scripts/media-kit/render-*.mjs` — which the hook does **not**
> match. R-0 is advisory for those and mechanical only for `render-kit`. Do not read a silent hook
> as approval.

## Tiers

**Rule R-1.** Route on who or what catches a wrong answer, never on the task's name.

| Who catches it | Tier | Model |
|---|---|---|
| A gate — `preflight.mjs`, a build that fails, a diff against an approved ref in `scripts/apparel/ref/` | Mechanical | `haiku` |
| A gate exists, but the work is real editing — card layout, payload edits, template geometry | Standard | `sonnet` |
| A person judges appearance or wording; or failure is silent | Judged | `opus` |

**Rule R-2.** Highest matching tier wins. Nothing de-escalates mid-task.

**Check.** Name the command that would fail if the output were wrong. Cannot name one => Judged.

## Gates — every tier, no exceptions

0. **Rendering is not publishing.** An asset headed for social or print gets a human look before it
   goes out. A cheaper tier reaches this step sooner; it does not remove it.
1. **Player names render only for registered players under the media release.** The source of fact is
   the tournament roster CSV plus `/waiver` (liability release, media consent, assumption of risk).
   **Check:** a named player on a rendered card traces to a roster row for that event.
2. **Payment and registration status never render.** `scripts/story-assets/jpo-mens.csv` carries
   `Status` (e.g. `Paid`) on the same row as the team list. A card that renders a roster row
   uncritically leaks who has and has not paid. **Check:** grep the render payload for `Paid`,
   `Unpaid`, `Status` before the run; the only fields that may reach a card are name and team.
3. **Standings and scores come from the event's system of record, never from a prior render.**
   Re-rendering yesterday's card with today's date is how a stale number ships. **Check:** the payload
   names its source and the date it was pulled.
4. **Apparel print art matches an approved reference.** `scripts/apparel/ref/` and the season folder
   hold what was approved. DTF art is expensive to get wrong — it is printed, not reposted.
   **Check:** diff the render against the approved ref before sending to print.

## Escalation

**Rule R-3.** Stop and re-dispatch at Judged if a gate fails in a way one edit cannot localize, the
task turns out to touch player names or money, or the output is headed to print or a social queue.

## What would change this standard

- A mechanical roster-field allowlist in the render scripts would move gate 2 from human to machine
  and let some card renders drop to Mechanical.
- Teaching the dispatch hook this repo's own render entrypoints would make R-0 mechanical here.
