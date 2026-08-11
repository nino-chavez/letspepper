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
> **What has to be true before the first post goes out** — see "Ship gate" below.
> The short version: the app itself still says *Film Room*. Announcing *Cutting
> Board* to 1,900 people before the product agrees with the name is the whole
> risk this staging exists to hold.

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

Decision 0067 sets a deliberate sweep order. This campaign sits inside it rather
than around it.

| Before posting | Why |
|---|---|
| **0067 phases 1–3 land** — `APP_NAME`, `productName`, `main.rs`, sample-event fork | The app a respondent opens must say Cutting Board. Today it says Film Room. |
| **Post 4 only:** the public repo reads as Cutting Board | `github.com/nino-chavez/film-room-oss` currently renders a README titled **Film Room** that also says "The repository is private" — false for the public mirror. A caption naming that URL sends people to a contradiction. Rewriting the README clears it; the 0067 phase-7 repo rename is not required first, because GitHub preserves redirects. |
| **Media exists and is approved** | See "Media" — nothing shippable exists today. |
| **Nino's screenshot verdict** *(only if any post uses an app capture)* | The visual bundle is unbound pending that verdict, and 0067 phase 5 requires a real recapture against the renamed app. A re-hash is not a capture. |

**Not required:** 0067 phase 6 (republished DMG) or phase 7 (repo rename).
Neither post links a download, so neither gates the campaign.

## The link problem, and how these posts route around it

Decision 0064 §4 keeps the download page `noindex`/`nofollow` and describes the
channel as an internal alpha for people the operator invites. The page says so
in its own footer: *"Share it only with the people you invite."*

**No post links that page.** Publishing its URL to 1,900 people converts an
invite-only alpha into a general launch, which is a decision record and an
operator call — not a side effect of a marketing task.

So the CTA is **comment or DM**, and Nino hands the link out individually. That
is precisely the mechanism 0064 already authorizes, and it doubles as the
feedback channel. The one public URL any post carries is the AGPL source repo,
gated as above.

Note: "link in bio" is on the house blocked-phrase list in
`scripts/media-kit/lint-copy.mjs`. None of these captions use it.

## Calendar

Relative days, because the start date depends on the ship gate clearing.
`scheduledAt` is `null` in the queue until then — fill real UTC timestamps when
the gate clears, and the Worker will post them earliest-first.

| Day | Item | Job |
|---|---|---|
| D+0 | `announce` | What it is and why it exists |
| D+3 | `the-loop` | The three stages, and that you own all three |
| D+6 | `boundary` | What it deliberately does not do |
| D+9 | `free-and-open` | Free, AGPL, and why the licence is not a pose |
| D+12 | `the-ask` | Who should try it, and the three questions |

Five anchors, matching the pattern in `poblano-2026-finale.md`. Every caption is
fully resolved — no publish-time fills — so the only thing standing between this
queue and a post is media, the gate, and an operator flipping `draft` to
`pending`.

## Media — nothing shippable exists today

The queue rule in `poblano-2026-finale.json` is that only fully-resolved items
get queued. Extending it to media: each item names the file it needs and its
real status. **All five must be produced.**

| Item | Needs | Status |
|---|---|---|
| `announce` | 4:5 title card | Must be produced |
| `the-loop` | 3-card 4:5 carousel — Ingest / Review / Deliver | Must be produced |
| `boundary` | 4:5 card, the five "does not" lines | Must be produced |
| `free-and-open` | 4:5 card, AGPL | Must be produced |
| `the-ask` | 4:5 card, the three questions | Must be produced |

Three existing assets were considered and each is unusable:

- `film-room/apps/portal/public/beta/film-room-review-current.jpg` — shows the
  old name, and it is exactly the capture 0067 phase 5 says must be redone. The
  visual bundle is unbound pending the operator's verdict; do not assert a
  capture that has not happened.
- `flickdaymedia/motion/filmroom-pick-proof/renders/jpo-C2355-branded-9x16.mp4`
  — the only social-native asset that shows the tool working on real footage,
  but it is Flickday-branded, on JPO footage, and carries the old name. Wrong
  brand for a Cutting Board post on a photography account.
- `film-room/apps/portal/public/og-current.png` — modified and uncommitted in
  the film-room working tree; contents unverified.

**The strongest asset this campaign could have** is a short screen recording of
the Review board on the renamed app. It is also the most gated: 0067 phase 5
plus the operator's visual verdict. Treat it as an upgrade to `announce` or
`the-loop`, not a blocker for either.

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
- **No download link, no unlisted page URL.** See "The link problem" above.

## Where the responses go

Feedback that arrives by comment or DM is a new evidence class for the project:
first human encounter from outside the operator. Route it into the existing
contract rather than a new one — a dated entry under `film-room/feedback/` with
its evidence class named, and a row in `feedback/TRIAGE.md`. The standing triage
rules already say how to weigh it.
