# Owned Instagram + Facebook Page publishing platform

**Which surface a post goes out on is not decided here.** Posts to Nino's accounts go out by hand — native Instagram for a Collab or a sticker-bearing Story, Meta Business Suite for an ordinary Instagram + Facebook Page crosspost — unless he has approved the Graph API for that post or campaign. The `meta-publish` skill owns that routing table and the preflight manifest; load it before publishing anything. This document covers one route: the owned Graph publisher, which is for scheduled, batch, drip and queue-owned campaigns. That it can also publish a Collab carousel is a capability, not an approval — see [Route gate](#route-gate).

Fully controlled, no third-party SaaS. Multi-account scheduled publishing over Instagram's [Content Publishing API](https://developers.facebook.com/docs/instagram-platform/content-publishing), Facebook's [Pages API](https://developers.facebook.com/docs/pages-api/posts/), and the [Facebook Reels Publishing API](https://developers.facebook.com/docs/video-api/guides/reels-publishing/) (Graph API v25.0). The project browser profile is the fallback for event creation, groups, Story stickers, and other surfaces the APIs do not expose.

```
accounts.json            registry: account slug → ig_user_id (+ handle, page_id)
build-queue.mjs          folder of media → queue/<event>.json (per-account, scheduled)
build-album-carousel.mjs gallery album → R2-hosted CAROUSEL queue/<event>.json
build-gallery-announce.mjs  standing campaign: one album → held CAROUSEL, APPENDED to queue/gallery-announce.json
select-gallery-photos.mjs   swappable photo-selection strategy for build-gallery-announce.mjs
alt-text.mjs                derives Instagram/Facebook alt text from the site's own caption
gallery-announce-caption.mjs   facts-only caption template for build-gallery-announce.mjs
hold-shape.mjs           the held/vetoed check both publishers share (never opened by --force)
veto-announce.mjs        kill one gallery-announce album locally before it publishes
upload-r2.mjs            push media to a public R2 bucket, write URLs into the queue
post-reels.mjs           local Instagram publisher (reels / image / carousel)
route-gate.mjs           refuses any local publish that has no approved Graph route
route-shape.mjs          the standing-route check both publishers share
graph-routes.json        tracked list of campaigns approved to publish through the API
seed-kv.mjs              seeds a queue into the Worker's KV with its route copied from graph-routes.json
worker/src/index.js      scheduled Instagram + Facebook Page publisher
```

## Architecture
- **One Business Manager — Almost Flickday** (`id 4033438730307424`) owns every IG account (`nino.chavez.photo`, `letspepper.open`, `flickday.media`). One ownership root.
- **Two Meta apps, two isolated System Users, separate tokens.** Meta exposes the Instagram-content and Page-management use cases separately in the current app flow. `Lets Pepper Publisher` owns the Instagram credential; the employee-level `Pepper Page Publisher` owns the Facebook Page credential. This keeps a Page-token rotation from revoking the working Instagram token. Validate granted scopes and asset tasks live before enabling a destination. Use Meta's current 60-day System User token option and refresh it before expiry.
- Host is **`graph.facebook.com`** (Business path) — each account addressed by its numeric `ig_user_id`. (`graph.instagram.com` is the single-account Instagram-Login path; not used here.)
- Hard API limits to design around: **Business accounts only** (Creator rejected); **can't tag private collaborators**; **Stories can't have collaborators** (→ Playwright fallback). Limit: 100 published posts / 24h / account.

---

## Route gate

Every local publish passes through `route-gate.mjs` before the copy audit, the R2 upload and the first Graph call. It refuses (exit code `3`) unless one of these holds:

- **Standing route.** The event is listed in `graph-routes.json` with a reason, an approval date and the `accounts` it covers (enforced, including against `--account`; optional `expires`). For a scheduled, batch or drip campaign Nino has approved to run through the API. The file is tracked, so the approval is a diff he can review. It starts empty.
- **One-off route.** The command is run with `--graph-route "<Nino's words>"`, and the words have to name the Graph API as the way this post goes out — "publish this now" is not that. The reason is recorded on the queue item as `route` — the route receipt — once the run is past its token check and copy audit, and it stays in the ledger. `post-now.mjs` always needs one, because every ad hoc post is a one-off. A one-off is **one post, and the one Nino named**: without a standing route a run publishes exactly one item, picked with `--id` whenever more than one is due. So a reason given for one post cannot be stretched over a backlog with `--force --count 80`, and `--count 1` cannot land his words on whichever item happens to be oldest. A receipt goes stale after 24 hours — approval for an ad hoc post means "now" — and it is bound to the post it approved: change the account, caption, media, tags or collaborators and the item needs a new yes.

`--dry-run` is refused the same way, so a dry run cannot pass where the live run would stop. Gated entry points: `post-reels.mjs`, `post-now.mjs`, and `--post` on `build-album-carousel.mjs` and `build-top-shots.mjs`. Not gated: `build-fb-album.mjs`, a bulk fill the Facebook composer cannot do.

**The scheduled Worker** checks the same entry shape (`route-shape.mjs` owns it for both). It publishes an item only when that item's KV queue carries `meta.route`, a complete entry that is still in date and names the item's account. Anything else goes terminal before any Graph call, in the resume path as well as the fresh-post path. Terminal means both destinations are marked `error`, and `route_error` says why. `/status` reports each event's `route` and a `route_refused` count. Seed with `seed-kv.mjs`, which copies `meta.route` from the event's `graph-routes.json` entry and refuses when there isn't one:

```bash
node scripts/social-publish/seed-kv.mjs --event <slug>                     # preview: writes queue/<slug>.kv.json only
node scripts/social-publish/seed-kv.mjs --event <slug> --put               # stamps the route onto the live queue
node scripts/social-publish/seed-kv.mjs --event <slug> --replace --put     # pushes changed local content
node scripts/social-publish/seed-kv.mjs --event <slug> --revive a,b --put  # re-opens route-refused items
```

KV, not `queue/<slug>.json`, is the record of what the Worker has published, so the script reads the live key first. When it exists, the route is stamped onto the live queue and its items are left alone. `--replace` pushes the local file instead, and is refused if that would drop any publish state the Worker recorded: with a route on it, a queue that forgot an item was posted would post it again. KV has no compare-and-set, so `--put` refuses within five minutes of the hourly tick and re-reads the key just before writing; that narrows the race with a Worker run to milliseconds without closing it. A refused item stays refused when a route is added later. `--revive` puts the destinations a route refusal closed back to `pending`; a Graph error stays terminal.

**What this does not prove.** A queue written to KV is no longer, by itself, an instruction to publish. But `meta.route` is still written by whoever writes KV, so a hand-written block passes the Worker exactly as a copied one does. The tracked `graph-routes.json` entry is the approval, and the KV copy only carries it. Making the Worker refuse anything that file lacks would mean bundling the file into the Worker, so every approval would need a deploy. Not done.

Why it exists: on 2026-09-21 an agent asked to publish an ad hoc Collab carousel found this publisher, confirmed it supported the job, and published. Nino's correction — the post should have gone out by hand — arrived 26 seconds after it went live. The instructions that would have stopped it were written down and were not read. The gate does not depend on anything being read.

```bash
pnpm test:social          # every file in test/, including a replay of that incident: exit 3, zero Graph requests
pnpm social:worker:test   # every file in worker/test/: every Worker refusal sees zero Graph requests, beside a control that sees the publish
# (exact counts drift as tests are added — both scripts glob their whole test/ directory, not a fixed file, so don't hardcode a number here)
```

---

## One-time setup

### Phase 0 — account foundation (Business Manager UI; do these yourself)
The Business settings SPA resists automation and these claim assets, so they're manual. In **business.facebook.com → Almost Flickday → Business settings → Accounts → Instagram accounts**:
1. **Add** each IG account: `nino.chavez.photo`, `letspepper.open`, `flickday.media` (log into each IG when prompted). If an account shows only under a Page, use the Page's "Connect Instagram".
2. Confirm each is a **Business** account (Settings → Account type in the IG app). Creator won't publish via API.
3. Under **Accounts → Pages**, confirm each IG is linked to its FB Page (needed to resolve `ig_user_id`).

### Phase 1 — Meta apps + System User tokens (token generation is login-gated)

Meta's current app-creation flow treats **Manage messaging & content on
Instagram** and **Manage everything on your Page** as incompatible use cases.
Use two apps and two System Users attached to the same **Almost Flickday**
portfolio:

1. **Lets Pepper Publisher app + Lets Pepper Publisher System User** —
   Instagram use case. The app currently locks its token to
   `catalog_management`, `instagram_basic`, `instagram_content_publish`,
   `instagram_manage_comments`, `instagram_manage_contents`,
   `instagram_manage_insights`, `instagram_manage_messages`,
   `pages_read_engagement`, and `pages_show_list`, plus `public_profile`.
   Keep the existing owned-asset assignments.
2. **Lets Pepper Page Publisher app + Pepper Page Publisher System User** —
   Page-management use case. Assign the app with **Manage app**. Assign the
   three paired Pages with only **Content** and **Insights**, which yield
   `CREATE_CONTENT` and `ANALYZE` Page tasks.
3. Generate the Page token with only `pages_manage_posts`,
   `pages_show_list`, and `pages_read_engagement`.
4. Store each token separately in 1Password. Both expired on 2026-09-24 and
   were reissued on 2026-09-25 as non-expiring System User tokens (Meta's
   `debug_token` reports `expires_at: 0`). A non-expiring token only stops
   working when it is revoked, the System User loses an asset, or a scope is
   removed, so check it with `debug_token` rather than a calendar date. After
   reissuing one, confirm it reaches every account: the Instagram token reads
   each `ig_user_id` in accounts.json, the Page token each `page_id`.

The current Instagram credential is in `Developer Secrets` as
`Meta Lets Pepper Instagram Publisher`; the revoked `Meta Almost-Flickday` item
is retained only as an audit record. Store the active token on the Worker as
`IG_ACCESS_TOKEN`:

```bash
op item create --category "API Credential" --vault "Developer Secrets" \
  --title "Meta Lets Pepper Instagram Publisher" credential="SYSTEM_USER_TOKEN"
pnpm dlx wrangler secret put IG_ACCESS_TOKEN
```

Store the Page-publisher token in a separate item, then set it on the Worker as
`FB_ACCESS_TOKEN`:

```bash
op item create --category "API Credential" --vault "Developer Secrets" \
  --title "Meta Lets Pepper Page Publisher" credential="SYSTEM_USER_TOKEN"
pnpm dlx wrangler secret put FB_ACCESS_TOKEN
```

### Resolve IG user IDs → accounts.json
With the token, get each account's numeric id and write it into `accounts.json`:
```
TOKEN=$(op read "op://Developer Secrets/Meta Lets Pepper Instagram Publisher/credential")
# list Pages you manage and their linked IG business accounts:
curl -s "https://graph.facebook.com/v25.0/me/accounts?fields=name,id,instagram_business_account{id,username}&access_token=$TOKEN" | jq
```
Paste each `instagram_business_account.id` into the matching `ig_user_id` in `accounts.json` (and `page_id`).

### Facebook Page destination state

Facebook publishing is opt-in per queue item:

```json
{
  "channels": ["instagram", "facebook"],
  "status": "pending",
  "facebook_status": "pending",
  "facebook_caption": "Optional Page-specific copy",
  "facebook_title": "Optional Reel title"
}
```

Legacy queue items without `channels` remain Instagram-only. Instagram continues to
use `status`, `ig_container_id`, and `ig_media_id`; Facebook uses its own
`facebook_status`, `facebook_post_id`, and `facebook_error`. A failure on one
destination never changes the other destination's receipt.

For Facebook Reels, the worker translates matching Instagram collaborator handles
into the Page IDs in `accounts.json` and sends Page collaborator invitations after
the Reel publishes. Photos publish independently to the Page that pairs with the
item's `account`.

The dedicated `FB_ACCESS_TOKEN` is used by default. If Meta requires an
asset-specific Page access token, set the matching Worker secret:

```text
FB_LETSPEPPER_ACCESS_TOKEN
FB_FLICKDAY_ACCESS_TOKEN
FB_NINOPHOTO_ACCESS_TOKEN
```

---

## Per-event run

```bash
EVENT=bell-pepper-2026
DIR="/Users/nino/Workspace/create/export/videos/Bell Pepper 2026"

# 0. a campaign needs a standing route before it can publish from this machine:
#    add "$EVENT" to scripts/social-publish/graph-routes.json with Nino's approval
#    ({ "reason", "approved": "YYYY-MM-DD", "scope" }) and commit it.

# 1. build the queue for the letspepper account — 2/day at noon & 7pm
node scripts/social-publish/build-queue.mjs \
  --dir "$DIR" --event $EVENT --account letspepper \
  --start 2026-06-16T12:00 --per-day 2 --hours 12,19

# 2. (optional) per-clip captions: "$DIR/captions.json" = { "<file>.mp4": "caption" }; re-run build-queue.
#    (optional) cross-post to Flickday's grid: add "flickday.media" to each item's
#    "collaborators" in queue/<event>.json — it appears on both grids via Collab.

# 3. upload media to R2
node scripts/social-publish/upload-r2.mjs \
  --event $EVENT --bucket letspepper-reels --prefix $EVENT \
  --public-base https://pub-xxxx.r2.dev

# 4. dry-run, then publish what's due
export IG_ACCESS_TOKEN=$(op read "op://Developer Secrets/Meta Lets Pepper Instagram Publisher/credential")
node scripts/social-publish/post-reels.mjs --event $EVENT --dry-run
node scripts/social-publish/post-reels.mjs --event $EVENT --count 2
```

Campaigns are scheduled through the Worker (`worker/wrangler.jsonc` carries the hourly cron; whether the deployed copy is armed is a Cloudflare fact, so check there). The Worker publishes a campaign only once `seed-kv.mjs` has seeded it with its route, so a campaign needs its `graph-routes.json` entry either way. No cron or launchd job on this machine publishes (checked 2026-09-21). A local cron would look like this, and needs the event's standing route in `graph-routes.json` or every run is refused:
```
5 12 * * *  cd /Users/nino/Workspace/dev/apps/letspepper && \
  IG_ACCESS_TOKEN=$(op read "op://Developer Secrets/Meta Lets Pepper Instagram Publisher/credential") \
  node scripts/social-publish/post-reels.mjs --event bell-pepper-2026 --count 5 >> /tmp/lp-reels.log 2>&1
```

## Per-album carousel (photography gallery)

One command turns a gallery album into an R2-hosted 10-image CAROUSEL queue, then
the same `post-reels.mjs` publishes it. Reads the album from the public gallery API
(no DB creds). Defaults: account `flickday`, collab `nino.chavez.photo`, bucket
`flickday-social`.

```bash
# 1. build (selects 10 — by AI quality score if scored, else a caption action/
#    emotion heuristic; pass --keys DSC1,DSC2,... to curate). Writes a contact
#    sheet to .temp/<event>-carousel.jpg to eyeball first.
node scripts/social-publish/build-album-carousel.mjs \
  --album saturday-triples-the-raiders-open-rdrsVB --count 10

# 2. publish (or add --post to step 1 to chain it). An album carousel is a single
#    post, so it needs a one-off route: pass what Nino said. Without it, this is
#    refused — an ad hoc Collab goes out through native Instagram by default.
IG_ACCESS_TOKEN=$(op read "op://Developer Secrets/Meta Lets Pepper Instagram Publisher/credential") \
  node scripts/social-publish/post-reels.mjs --event rdrsVB --account flickday --count 1 \
  --graph-route "<Nino's words>"
```

Why R2 and not the gallery's `imagedelivery.net` URLs: Cloudflare Images negotiates
to webp on a webp-Accept fetch and Instagram rejects webp. The builder fetches the
`large` variant as jpeg and re-hosts on R2 (which serves the stored type verbatim).
The `flickday-social` bucket has public dev access enabled for exactly this.

## Gallery announcements (standing campaign)

The one route in graph-routes.json that isn't per-post: Nino approved a **standing**
"gallery announcements" route (2026-09-25 — quoted in that entry's `reason`) so that
every published photography album can post unattended, once its build has a hold
window, Facebook crosspost, and alt text — this is that build.

```bash
# 1. build (dry-run first — no R2 upload, no queue write, no Graph/wrangler call).
#    Selection is delegated to select-gallery-photos.mjs (or --strategy <path>).
node scripts/social-publish/build-gallery-announce.mjs \
  --album-key Re7kho --series other --dry-run
#   → writes .temp/gallery-announce-<key>.dry-run.json (a meta-publish manifest)

# 2. build for real (appends ONE item to queue/gallery-announce.json — never
#    overwrites; refuses a duplicate album id instead of double-adding it):
node scripts/social-publish/build-gallery-announce.mjs --album-key Re7kho --series other

# 3. seed the new item to the Worker's KV without touching any item the Worker has
#    already started on (--replace is refused the moment anything has posted; this
#    merges only the ids KV doesn't have yet):
node scripts/social-publish/seed-kv.mjs --event gallery-announce --append --put
```

**`--series` is required, not defaulted.** There is no public read path to an
album's `gallery_scope` — `album_settings` is read anon, server-side only, with no
API route (checked in the photography repo 2026-09-25) — and many albums in this
scope are high-school girls' volleyball. `lpo` routes to `letspepper.open`;
anything else routes to `nino.chavez.photo`. `flickday.media` is **always** added
as a Collab collaborator on every album, regardless of series (Nino: "by series
and collab with flickday").

**The hold window.** Every item is created `status: "held"` with `holdUntil` (default
12h out, `--hold-hours` to change it) — hold-shape.mjs's `holdBlock()` refuses BOTH
destinations in both publishers (post-reels.mjs and the Worker) until it passes, and
`--force` does not open it. Once `holdUntil` passes the item becomes ordinarily
publishable — nothing has to flip its status back to `pending`. **Kill a bad pick**
before it posts:

```bash
node scripts/social-publish/veto-announce.mjs --album-key Re7kho --reason "wrong gallery scope" --dry-run
node scripts/social-publish/veto-announce.mjs --album-key Re7kho --reason "wrong gallery scope"
```

This only edits the LOCAL queue file. If the item was already seeded to KV
(step 3 above already ran for it), the veto has to be repeated directly against
KV — `--append` never touches an item KV already has — the script prints the
`wrangler kv key get` / hand-edit / `--put` steps when this applies.

**Photo selection** (select-gallery-photos.mjs, rewritten 2026-09-25). The
model's own quality sub-scores are unusable — on Re7kho, composition_score has
only 3 distinct values across 120 photos, and model "sharpness" correlates
with pixel-measured focus at Spearman 0.10. The default strategy no longer
reads them at all:
1. Downloads each photo's CF `medium` variant and hard-filters on image data:
   keeps only the album's majority orientation (Instagram crops every
   carousel slide to slide 1's aspect ratio, so a mixed set gets cropped
   badly — reports how many were dropped), then drops the bottom third by a
   deterministic sharpness score (variance of a 3×3 Laplacian on a downscaled
   grayscale). The alcohol/smoking hard block is unchanged.
2. Builds a ~24-photo shortlist spread across `play_type` and across time in
   the match (`created_at`, which — verified against Re7kho — already IS
   `photo_date` when the DB has one; see the module header for the exact gap
   in the site's own API this works around), with a few celebration slots
   reserved and burst near-duplicates collapsed.
3. Sends a numbered contact sheet of the shortlist to a vision model
   (OpenRouter, default `google/gemini-2.5-flash`) and asks for the final N in
   posting order plus a one-line reason each. Falls back to shortlist order
   (by sharpness) on any failure — bad JSON, an out-of-range index, a wrong
   count — and says so in the manifest. Cost on Re7kho: **$0.0012** (well
   under the $0.05/album target), from OpenRouter's own reported `usage.cost`.

The pre-rewrite strategy (quality-score-if-usable, else the caption
action/emotion heuristic) is kept, unmodified, as `selectGalleryPhotosByCaption`
— pass `--strategy caption` to build-gallery-announce.mjs to use it instead.
`--strategy vision` (the default) or a path to another module both still work.

**Alt text** (alt-text.mjs) is derived from the album's existing AI caption, not
written fresh, with jersey numbers and any quoted on-scene signage
(`"CENTRAL CATHOLIC TIGERS"`-style banner transcriptions — measured live on
Re7kho) stripped unconditionally. There is no public or persisted `visible_text`
field to diff against (see that file's header), so a Title-Case backstop
catches a likely name pair when nothing else is available — call it a defensive
net, not a verified filter, in anything that cites it.

**Facebook crosspost of a carousel** has no native multi-photo post type on
Facebook's side. The Worker uploads each image child as an UNPUBLISHED photo
(`published=false`, one `alt_text_custom` each) via `/{page-id}/photos`, then
attaches every resulting photo id to ONE `/{page-id}/feed` post via
`attached_media` — the same two calls this file's own 2026-07-29 capability
probe verified live (see "Facebook Page photo album" below). `published=false`
only works with a real Page token (that same probe); the Worker now checks for
that and refuses explicitly, before uploading a single photo, rather than
failing opaquely partway through when only the System User token resolves.
**Not carried over: a Collab on the Facebook side.** The Worker only sends Page
collaborator invitations on Reels (`inviteFacebookCollaborators`) — a carousel
crosspost posts with no Facebook-side collaborator at all.

**Unverified against Cloudflare's actual limits for this account's plan — check
before relying on this at 10 slides.** Cloudflare's published limits (fetched
2026-09-25, not this account's dashboard, per Cloudflare's docs: KV calls count
as Workers subrequests): KV writes to the SAME key are capped at 1/second on
every plan; Workers subrequests are capped at 50 per invocation on Free, up to
10,000+ on Paid. One gallery-announce tick's real worst case, counting KV:
- Graph calls: 10 IG child containers + 1 parent + up to 15 status polls + up
  to 4 publish retries (~30), plus 1-2 Page-token lookups + 10 unpublished
  Facebook photos + 1 feed post (~13) ≈ 43.
- KV calls (each one also a subrequest): up to 3 queue loads in
  `resumeIfBuilding` (one per `ACTIVE_EVENTS` entry) + 1 in `postDuePending`
  ≈ 4, plus ~13 `persistQueue` puts (2 on the Instagram side, one per photo on
  the Facebook side — up to 10 — and 1 final Facebook put) ≈ 13.
- **Total: roughly 42 on a clean happy path, up to ~60 with retries and every
  event's queue checked — over the Free plan's 50/invocation cap in the worst
  case, not merely close to it.**

`uploadFacebookCarouselPhotos` calls `persistQueue` after every photo — up to
10 same-key writes in one tick, against KV's 1-write-per-second-per-key cap.
Cloudflare's docs give the limit but not the failure mode for a second write
within that second (throttled? queued? silently dropped?) — that part is
unverified. Whether Graph's own per-call latency naturally spaces those puts
out past a second each is also unverified. This needs the account's actual
plan tier, which this file cannot see, before it can be called safe at 10
slides; no code change was made for it in this branch.

**Collaborators — the `collaborators` create parameter is confirmed from Meta's
own docs (fetched 2026-09-25):** the IG User `/media` reference lists it as "A
list of up to 3 instagram usernames as collaborators on an ig media. Not
supported for Stories" — matches what this file already called
"community-confirmed," now first-party. **An invite is NOT automatic
acceptance**, also from Meta's own docs: the IG Media `collaborators` edge
(`GET /{ig-media-id}/collaborators`) reports each invite's `invite_status` as
`Accepted` or `Pending` (no `Declined` value is documented — an earlier draft
of this note claimed one, sourced from third-party blog posts, not Meta; that
claim is withdrawn). That same page states plainly that **create, update, and
delete are all "not supported"** on this edge — Meta documents no API call
of any kind to accept or decline an invite. **flickday.media has to accept
the invite from inside the Instagram app itself** (its notifications) before
it shows as a co-author. Nothing in this pipeline can do that for them, and
nothing in Meta's docs suggests it's possible to automate.

## Facebook Page photo album (photography gallery)

A real named album in the Page's Photos tab — the surface that gets browsed,
reshared, and tagged into long after a feed post scrolls away. Two API walls make
this a **hybrid**: you create the album shell in the composer, the script fills it.

**Verified live 2026-07-29 against Graph v25.0, both token types:**

| What | Result |
|---|---|
| `POST /{page-id}/albums` | `(#3) Application does not have the capability` — album creation is closed to Standard Access. |
| `@[<page-id>]` in a `message` | Token silently stripped, no `message_tags` returned. Mentioning another Page needs Page Public Content Access (App Review). |
| `POST /{page-id}/photos` `published=false` | Works — but only with a **Page** token, not the System User token (`(#200) Unpublished posts must be posted to a page as the page itself`). |
| `POST /{page-id}/feed` `attached_media[]` | Works — a multi-photo post, not a named album. |
| `POST /{album-id}/photos` | **Works.** Probed against the Page's own cover album and the photos deleted after. `(#3)` gates album *creation* only, not writes into an existing album. |

So the album name and the partner @mention are typed once in the composer (the
only place a Page mention registers), and `build-fb-album.mjs` bulk-uploads into
it. The script derives the Page token from the System User token at runtime — no
new secret.

**Or drive the composer.** `fb-composer.mjs` runs the whole album flow through
the logged-in `meta-setup` browse-tool profile with real mouse and key events —
that is how the Big Dig album (195 frames) was created on 2026-07-29. Run the
browser **headed**; headless clicks no-op on Facebook's menus. Read that file's
header before touching it, the selector quirks are all load-bearing.

```bash
browse-start --profile-name meta-setup        # headed, already logged in
node scripts/social-publish/fb-composer.mjs switch      # act as the Page
node scripts/social-publish/fb-composer.mjs click "Create album" partial
node scripts/social-publish/fb-composer.mjs typeidx 0 "<album name>"
node scripts/social-publish/fb-composer.mjs upload "Upload photos" "$(ls /path/frames/*.jpg | paste -sd, -)"
node scripts/social-publish/fb-composer.mjs clickxy 180 909    # Post
```

**Two limits the browser does NOT solve**, both verified 2026-07-29:
- **Tagging an unconnected Page is still manual.** The @mention typeahead
  resolves *connected* Pages only: "@Players Sport" opens nothing, and the
  composer's "Tag people" panel answers "No results" for any Page you don't
  already have a connection to. The mechanism works when you type it yourself —
  it just can't be driven from here for a partner org.

  **Corrected 2026-08-02: a *connected* Page CAN be driven from here.** The line
  that used to say otherwise was wrong. `@Flickday Media` resolved and inserted
  under automation on the personal-profile composer — see `fb-composer.mjs`'s
  header for the two rules (don't re-click after typing "@"; wait ~2.5s for the
  listbox to populate) and the span[spellcheck="false"] check that proves the
  mention resolved before you press Post.
- **An album story's caption cannot be edited past 80 photos.** Facebook's post
  editor refuses to save ("You can only add 80 photos to a post"), so a 195-photo
  album story is stuck with an empty message. Put the copy on a companion feed
  post or a comment instead — which is what last week's albums did anyway.

**Status: the upload loop is not yet live-verified.** Its capability probe
(`POST /{album-id}/photos`) was confirmed against a real album, but the Big Dig
album was ultimately built through the composer instead, so this script's
end-to-end run has never happened. Dry-run it and watch the first few before
trusting a full pass.

```bash
# 1. In the Facebook composer, as Flickday Media: Photos/Videos → Create album.
#    Name it, and type the @mention in the description (autocomplete, not @[id]).

# 2. Rank + report; uploads nothing.
node scripts/social-publish/build-fb-album.mjs \
  --album chicago-big-dig-2026-north-avenue-beach-1BlKk4 \
  --fb-album "Chicago Big Dig 2026" --dry-run

# 3. Upload. --resume retries only what failed.
node scripts/social-publish/build-fb-album.mjs \
  --album chicago-big-dig-2026-north-avenue-beach-1BlKk4 \
  --fb-album "Chicago Big Dig 2026"
```

Ranks by the gallery's AI quality score (sharpness + composition + emotional
impact) so the strongest frame lands first and becomes the album cover, and
writes a per-photo ledger to `queue/fb-album-<key>.json` so a rate-limit stop
resumes instead of double-posting.

**The brand-safety block list is close to inert and should not be trusted.** It
matches `beer`/`bottle`/`drink` against the AI caption, but those captions
describe play ("a player in brown digs a volleyball"), so a sponsor's beer deck
in frame will not trip it — the Big Dig run dropped 0 of 267. The real gates are
`--min-score` (13–22 of 30 on that album) and `photo_category` in the manifest,
plus your own eyes. This is inherited from `build-album-carousel.mjs`, where it
is equally ineffective. Image bytes go straight from Cloudflare Images
to Facebook as a multipart upload — no R2 hop, because Facebook takes binary
where Instagram needs a public URL.

**Two gotchas this surfaced in the existing carousel builder** (not yet fixed there):
- The gallery API now sits behind a Cloudflare bot challenge that 403s plain
  `fetch`, so `build-album-carousel.mjs`'s manifest read fails. This script falls
  back to running the same fetch inside the browse-tool browser.
- Quality scores are nested under `metadata`, not on the photo root, so the
  carousel builder's `qualityScore()` always returns null and it has been ranking
  by the caption heuristic on albums that were in fact scored.

## Ad-hoc one-shot post (no event, no schedule)

An ad hoc post goes out by hand unless Nino named the Graph API for it (the
`meta-publish` skill owns that choice). When he did, `--graph-route` carries his
words and is required — without it `post-now.mjs` refuses before it writes the
ledger, uploads, or calls Meta.

```bash
# feed post (IMAGE from .jpg/.png, REELS from .mp4/.mov — inferred):
node scripts/social-publish/post-now.mjs --account letspepper \
  --file /path/to/graphic.jpg --caption "..." --graph-route "<Nino's words>"

# story (bare media — API stories take no caption/stickers/tags):
node scripts/social-publish/post-now.mjs --account letspepper \
  --file /path/to/story.jpg --story --graph-route "<Nino's words>"

# preview without touching anything:
node scripts/social-publish/post-now.mjs ... --dry-run
```

Wraps the same pipeline: appends to `queue/adhoc.json` (permanent ledger),
uploads via `upload-r2.mjs` (default bucket `flickday-social`), publishes just
that item via `post-reels.mjs --id`. Reads the token from 1Password itself if
`IG_ACCESS_TOKEN` isn't set. Posts land in under a minute for images.

## Capabilities
- **Multi-account:** `--account <slug>` or per-item `account` field → posts to any owned IG account from the one token.
- **Facebook Pages:** Worker items with `"channels":["instagram","facebook"]` publish an image, Reel, or (2026-09-25) a CAROUSEL to the paired Page and preserve independent destination state. A carousel crosspost uploads each child as an unpublished photo then attaches them all to one `/feed` post (see "Gallery announcements" above) — needs a real Page token, not the System User fallback.
- **Facebook Reel collaborators:** matching owned collaborator handles become Page collaborator invitations; invitation errors are recorded without rewriting a successful Reel receipt. **Not extended to a carousel crosspost** — that publishes with no Facebook-side collaborator.
- **User tags:** item `user_tags: ["flickday.media"]` → `user_tags=[{username}]` on the post.
- **Collab:** item `collaborators: ["flickday.media"]` → co-author invite (reels/image/carousel; not Stories; public accounts only). `collaborators` is community-confirmed but not in Meta's main doc — first live call verifies it; on rejection the item is marked `error` with the API message, not silently dropped. Verified working on a five-image carousel 2026-09-21. An invite is not an accept: `GET /{ig-media-id}/collaborators` reports Pending/Accepted/Declined, and the invited account has to accept it itself — nothing here does that on flickday.media's behalf. **Supported is not approved:** an ad hoc Collab goes out through native Instagram unless Nino named the API for it — the route gate refuses it otherwise.
- **Alt text (2026-09-25):** `alt_text` on an item/child → Instagram's `alt_text` on a single image or an image carousel child (never video/reels/stories, confirmed from Meta's current IG media reference). `facebook_alt_text` → Facebook's `alt_text_custom` on an IMAGE post or each CAROUSEL child photo. See alt-text.mjs for how gallery-announce derives it from the site's own caption.
- **Media types:** `media_type` = `REELS` (default) | `IMAGE` (`image_url`) | `STORIES` (`image_url` or `video_url`; bare media) | `CAROUSEL` (`children: [{media_type,image_url|video_url,alt_text}]`).
- **Stories:** published via the API since 2026-07-12 (Business accounts; `media_type=STORIES`). Bare media only — sticker/link/tag decoration is NOT in the API (see STORIES-SPEC.md for the decorated-firehose design). Accidental story? `DELETE /{ig-media-id}` works (verified live) — feed-media delete is unverified.
- **Hold + veto (2026-09-25):** item `status: "held"` + `holdUntil` → neither destination publishes before that timestamp, in either publisher, even with `--force` (hold-shape.mjs). `status: "vetoed"` is the same gate, permanently. See "Gallery announcements" above; veto-announce.mjs is the CLI for it.

## Notes
- Queue is the source of truth; saved after every publish; posted items are skipped (no double-post).
- Reels ≤ 90s, 9:16. `share_to_feed=true` also drops reels on the grid.
- **op cleanup (deferred):** consolidate the duplicate Facebook (4) + Instagram (8) 1Password items into clean convention-named entries once the token + account truth is settled.
- **Upgrade (unattended):** move step 4 into a Cloudflare Worker cron (token as Worker secret, queue in KV/D1, media in R2). Same publish logic, no machine-on dependency.
