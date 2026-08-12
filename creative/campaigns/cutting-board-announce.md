# Cutting Board announce — nino.chavez.photo

> ## STAGED — do not run
>
> **Media cleared 2026-08-11.** All seven assets are hosted at
> `r2://flickday-social/cutting-board-announce/` and every item passes the
> Worker's `hasMedia()`. That removes one of the three stops.
>
> **Two stops remain, on purpose.** Every item is `status: "draft"`, and
> `cutting-board-announce` is **not** in the Worker's `ACTIVE_EVENTS`. The
> Worker publishes only `pending`/`building` items (`instagramPending`,
> `worker/src/index.js`), so nothing here can post by accident.
>
> The queue file is untracked, following this repo's convention that
> `scripts/social-publish/queue/` is gitignored — zero queue files are in git.
> It lives in the main checkout alongside the others; this doc is its committed
> record.
>
> **The name gate cleared on 2026-08-11.** The rename landed (film-room PRs #12
> and #14) and the app now calls itself Cutting Board.

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

## Ship gate

| Was gating | State |
|---|---|
| Decision 0067 phases 1–3 — the app must say Cutting Board | **Cleared.** Landed in film-room PRs #12 and #14. |
| Phase 4 — public copy | **Cleared.** Same PRs: README, landing page, product docs. |
| The download page must be linkable | **Cleared.** Decision 0068 dropped the invite gate. |
| Media exists and is approved | **Cleared 2026-08-11.** Seven 4:5 assets rendered, hosted, and verified `200`. |
| Published DMG carries a correct in-bundle notice | **Open — see "The DMG advisory".** Not a stop on `announce`; is one on `free-and-open`. |

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
until that repository agrees with the name. Verified 2026-08-11: the page says
"The complete source for this build is at github.com/nino-chavez/film-room-oss"
in a full sentence, so a reader arrives with the mismatch framed rather than bare.

**The `free-and-open` card contradicts this, and it is an open decision, not an
oversight to fix silently.** The rendered card puts
`github.com/nino-chavez/film-room-oss` in its footer where the other four cards
put `apps.ninochavez.co/cutting-board`. The rule above was written about
captions; the card is media, and the same reasoning applies to it more strongly,
because a URL burned into an image is read without the sentence that frames it
and cannot be clicked. Three ways out, all fine: re-render the card with the
landing-page URL, land the phase 7 repo rename before D+9, or accept it
deliberately. Decide before that item flips.

Note: "link in bio" is on the house blocked-phrase list in
`scripts/media-kit/lint-copy.mjs`. None of these captions use it.

## Calendar

Relative days. Media is ready, so the start date is now purely the operator's
choice.

**`scheduledAt` is still `null` on every item, and that is a footgun, not a
neutral default.** The Worker gates a scheduled item on its own timestamp, but
treats a null-`scheduledAt` item as legacy drip and picks *randomly* within
allowed hours (`dueNow` / `pickOne`, `worker/src/index.js`). Flip more than one
item with nulls in place and `the-ask` can post before `announce` — which
directly defeats the preflight rule below. Fill real UTC timestamps first.

| Day | Item | Job |
|---|---|---|
| D+0 | `announce` | What it is and why it exists |
| D+3 | `the-loop` | The three stages, and that you own all three |
| D+6 | `boundary` | What it deliberately does not do |
| D+9 | `free-and-open` | Free, AGPL, and why the licence is not a pose |
| D+12 | `the-ask` | Who should try it, and the three questions |

Five anchors, matching the pattern in `poblano-2026-finale.md`. Every caption is
fully resolved and every asset is hosted, so what stands between this queue and a
post is three operator actions: fill `scheduledAt`, flip `announce` to `pending`,
and add `cutting-board-announce` to the Worker's `ACTIVE_EVENTS`.

## Media

The queue rule in `poblano-2026-finale.json` is that only fully-resolved items
get queued. Extending it to media: each item names the file it needs and its real
status.

| Item | Needs | Status |
|---|---|---|
| `announce` | 4:5 title card | **Hosted.** `01-announce.png`, 2160×2700 |
| `the-loop` | 3-card 4:5 carousel — Ingest / Review / Deliver | **Hosted** as three `children`, in swipe order |
| `boundary` | 4:5 card, the five "does not" lines | **Hosted.** `03-boundary.png` |
| `free-and-open` | 4:5 card, AGPL | **Hosted.** `04-free-and-open.png` |
| `the-ask` | 4:5 card, the three questions | **Hosted.** `05-the-ask.png` |

All seven files are 2160×2700 (4:5), uploaded to
`r2://flickday-social/cutting-board-announce/` and served from
`https://pub-068210f3c0834d56a2eef0f10bf15e2d.r2.dev` — the same bucket and
public base every other queue in this repo uses. Each URL was fetched back and
returns `200 image/png` at the expected byte count.

Carousels needed tooling that did not exist. `upload-r2.mjs` keyed on `it.file`
and would have skipped `the-loop` silently while reporting success. It now reads
an ordered `files` array and writes `children`, rebuilding the array whole so a
rerun cannot double-add or reorder a card. It also takes `--queue <path>`, so it
can be run against the queue in another checkout of this repo.

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

## The DMG advisory

These posts drive downloads. The artifact they land on has a known defect.

`Cutting-Board-0.1.0-arm64-signed-notarized.dmg` — signed, notarized, stapled,
and live now — embeds a `NOTICE.md` that tells a recipient the FFmpeg
corresponding source ships at
`Film Room.app/Contents/Resources/legal/dist/ffmpeg-source`. The installed bundle
is `Cutting Board.app`, so that path does not exist. The source *is* in the
bundle; the pointer to it names the wrong app. GPL and AGPL both turn on a
recipient being able to find corresponding source, and a notice naming a path
that isn't there fails at exactly that.

Fixed in the film-room repository at `e5172dd`, which is a descendant of the
`930d8a6` that published this DMG — so the fix is in the tree and not in the
artifact. Only a rebuild, re-notarization, and a new hash-bound upload repairs
it.

**This is not a stop on `announce`.** The defect is live now and indexable; the
campaign raises traffic to it, it does not create it. **It is a stop on
`free-and-open` at D+9**, which is the post that makes the licence claim and the
one that sends people to read the source. Land the rebuild before that item
flips.

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
- **No repository URL in captions** — but the `free-and-open` card carries one
  in its artwork, which is an open contradiction. See "Where the posts send
  people" above.

## Where the responses go

Feedback that arrives by comment, DM, or the page is a new evidence class for the project:
first human encounter from outside the operator. Route it into the existing
contract rather than a new one — a dated entry under `film-room/feedback/` with
its evidence class named, and a row in `feedback/TRIAGE.md`. The standing triage
rules already say how to weigh it.
