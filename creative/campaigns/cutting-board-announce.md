# Cutting Board announce — nino.chavez.photo

> ## STAGED — do not run
>
> Every item in `scripts/social-publish/queue/cutting-board-announce.json` is at
> `status: "draft"`, no media file exists yet, and `cutting-board-announce` is
> **not** in the Worker's `ACTIVE_EVENTS`. Three independent stops, on purpose.
> The Worker only picks up `pending`/`building` items that also pass `hasMedia`,
> so nothing here can post by accident.
>
> The queue file is untracked, following this repo's convention that
> `scripts/social-publish/queue/` is gitignored — zero queue files are in git.
> It lives in the main checkout alongside the others; this doc is its committed
> record.
>
> **The name gate cleared on 2026-08-11.** The rename landed (film-room PRs #12
> and #14) and the app now calls itself Cutting Board. **Media is the only
> remaining blocker** — see "Media" below.

Announce Cutting Board to the creatives who follow `nino.chavez.photo`, and ask
them for the one kind of evidence the project cannot generate for itself: a
first encounter by someone who is not the person who built it.

## Who this is for, and what we want back

**Audience.** 1,900 followers on a photography account. Photographers and
videographers, some of whom shoot events and sports alone.

**The job.** Awareness is the surface ask. The real one is feedback of a
specific class. `film-room/feedback/TRIAGE.md` states the standing rule:
synthetic evidence "cannot approve comprehension, comfort, native feel, or
release readiness." Only a human first encounter can. There has never been one
from outside the operator. That is what this campaign is buying.

**The three questions**, drawn from the launch contract's north star (a second
operator reaches useful output inside 20 minutes with zero engineer help):

1. Before you opened it — did you understand what it does?
2. In the first twenty minutes, where did you get stuck?
3. What did you expect it to do that it didn't?

## Ship gate — cleared except media

| Was gating | State |
|---|---|
| Decision 0067 phases 1–3 — the app must say Cutting Board | **Cleared.** Landed in film-room PRs #12 and #14. |
| Phase 4 — public copy | **Cleared.** Same PRs: README, landing page, product docs. |
| The download page must be linkable | **Cleared.** Decision 0068 dropped the invite gate. |
| Media exists and is approved | **Open.** The only remaining blocker. |

**Not required:** the operator's visual verdict, unless a post uses a capture
from the unbound evidence bundle. The one screenshot this campaign would use is
not from that bundle — see "Media".

## Where the posts send people

`https://apps.ninochavez.co/cutting-board`

Verified live on 2026-08-11: `200`, serving the film-room `apps/portal` build,
macOS DMG answering a range request `206`.

This replaces the comment-or-DM routing the first draft used. Decision 0068 in
the film-room repository (`decisions/0068-public-alpha-distribution.md`) dropped
the invite gate — a relative link is not used here because that decision lives in
a different repository — so the page is public and indexable and the captions can
simply name it. Instagram captions carry no clickable link, which is why the URL
is short and on its own line rather than buried in a sentence.

**The captions do not name the source repository.** It is public, but it is still
called `film-room-oss` and its README is still titled *Film Room* — the phase 7
rename and the README rewrite have not happened. Sending creatives from a post
about Cutting Board to a page about Film Room reads as a different product. The
landing page carries the source link in context, which is the right place for it
until that repository agrees with the name.

Note: "link in bio" is on the house blocked-phrase list in
`scripts/media-kit/lint-copy.mjs`. None of these captions use it.

## Calendar

Relative days, because the start date now depends only on media being ready.
`scheduledAt` is `null` in the queue until then — fill real UTC timestamps once
the assets exist, and the Worker will post them earliest-first.

| Day | Item | Job |
|---|---|---|
| D+0 | `announce` | What it is and why it exists |
| D+3 | `the-loop` | The three stages, and that you own all three |
| D+6 | `boundary` | What it deliberately does not do |
| D+9 | `free-and-open` | Free, AGPL, and why the licence is not a pose |
| D+12 | `the-ask` | Who should try it, and the three questions |

Five anchors, matching the pattern in `poblano-2026-finale.md`. Every caption is
fully resolved — no publish-time fills — so the only thing standing between this
queue and a post is media and an operator flipping `draft` to `pending`.

## Media

The queue rule in `poblano-2026-finale.json` is that only fully-resolved items
get queued. Extending it to media: each item names the file it needs and its real
status.

| Item | Needs | Status |
|---|---|---|
| `announce` | 4:5 title card | Must be produced |
| `the-loop` | 3-card 4:5 carousel — Ingest / Review / Deliver | Must be produced |
| `boundary` | 4:5 card, the five "does not" lines | Must be produced |
| `free-and-open` | 4:5 card, AGPL | Must be produced |
| `the-ask` | 4:5 card, the three questions | Must be produced |

**One real screenshot is now available and is the strongest asset here.**
`film-room/apps/portal/public/beta/cutting-board-review-current.jpg` is a genuine
capture against the renamed build — a throwaway profile seeded with 99 synthetic
portrait clips from the bundled sample, served locally, captured at 1440×900,
verified by OCR, profile deleted, no private footage at any point. It is already
published on the public landing page, so using it in a post distributes nothing
new.

Two caveats before it ships: it is 1440×900 and needs reframing to 4:5, and the
crop must not cut the operator-owned Keep / Highlight / Reject controls, which
are the point of the image. It is **not** from the unbound evidence bundle, so it
does not need the operator's pending visual verdict.

Two earlier candidates remain unusable, for the record:

- `flickdaymedia/motion/filmroom-pick-proof/renders/jpo-C2355-branded-9x16.mp4`
  — the only social-native asset showing the tool on real footage, but it is
  Flickday-branded, on JPO footage, and carries the old name. Wrong brand for a
  photography feed.
- `film-room/apps/portal/public/beta/film-room-review-current.jpg` — deleted
  upstream; the recapture above replaced it.

## Preflight

1. **`nino.chavez.photo` has never been published to by this system.** It is
   registered in `accounts.json` and resolves through the active token —
   verified 2026-08-11, `id 17841401886738878`, 1,900 followers, 147 media — but
   every prior queue item used it only as a *collaborator*. The
   `instagram_content_publish` path for this `ig_user_id` is unexercised. Post
   `announce` first and confirm it lands before flipping the rest.
2. **Token expiry.** The Instagram System User credential expires
   `2026-09-24T21:27:37Z`. A D+12 calendar started late runs into it.
3. **Business account, not Creator.** Creator accounts are rejected by the
   publishing API. Confirm in the IG app before the first flip.

## Deliberate omissions

- **No collaborators.** `flickday.media` reaches grassroots volleyball players
  and parents; that is not the audience for a video-prep tool. A collaborator
  post would put it on the wrong feed. Left empty as a decision, not an
  oversight.
- **Instagram only, no Facebook Page.** No `channels` field, which the Worker
  reads as Instagram-only. Creatives are the audience and they are on IG.
- **No engagement-sweep automation.** `SWEEP.md`'s auto-reply is off (shadow
  mode) and stays off. Every reply to these posts should be Nino's, because the
  replies *are* the deliverable.
- **No repository URL in captions.** See "Where the posts send people" above.

## Where the responses go

Feedback that arrives by comment, DM, or the page is a new evidence class for the project:
first human encounter from outside the operator. Route it into the existing
contract rather than a new one — a dated entry under `film-room/feedback/` with
its evidence class named, and a row in `feedback/TRIAGE.md`. The standing triage
rules already say how to weigh it.
