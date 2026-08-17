# Owned Instagram + Facebook Page publishing platform

API-first, fully controlled, no third-party SaaS. Multi-account scheduled publishing over Instagram's [Content Publishing API](https://developers.facebook.com/docs/instagram-platform/content-publishing), Facebook's [Pages API](https://developers.facebook.com/docs/pages-api/posts/), and the [Facebook Reels Publishing API](https://developers.facebook.com/docs/video-api/guides/reels-publishing/) (Graph API v25.0). The project browser profile is the fallback for event creation, groups, Story stickers, and other surfaces the APIs do not expose.

```
accounts.json            registry: account slug → ig_user_id (+ handle, page_id)
build-queue.mjs          folder of media → queue/<event>.json (per-account, scheduled)
build-album-carousel.mjs gallery album → R2-hosted CAROUSEL queue/<event>.json
upload-r2.mjs            push media to a public R2 bucket, write URLs into the queue
post-reels.mjs           local Instagram publisher (reels / image / carousel)
worker/src/index.js      scheduled Instagram + Facebook Page publisher
```

## Architecture
- **One Business Manager — Almost Flickday** (`id 4033438730307424`) owns every IG account (`nino.chavez.photo`, `letspepper.open`, `flickday.media`). One ownership root.
- **Two Meta apps, two isolated System Users, separate tokens.** Meta exposes the Instagram-content and Page-management use cases separately in the current app flow. `Lets Pepper Publisher` owns the Instagram credential; the employee-level `Pepper Page Publisher` owns the Facebook Page credential. This keeps a Page-token rotation from revoking the working Instagram token. Validate granted scopes and asset tasks live before enabling a destination. Use Meta's current 60-day System User token option and refresh it before expiry.
- Host is **`graph.facebook.com`** (Business path) — each account addressed by its numeric `ig_user_id`. (`graph.instagram.com` is the single-account Instagram-Login path; not used here.)
- Hard API limits to design around: **Business accounts only** (Creator rejected); **can't tag private collaborators**; **Stories can't have collaborators** (→ Playwright fallback). Limit: 100 published posts / 24h / account.

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
4. Use Meta's recommended 60-day expiration and refresh before expiry. Store
   each token separately in 1Password. The current Instagram credential expires
   `2026-09-24T21:27:37Z`; the current Page credential expires
   `2026-09-24T20:30:17Z`.

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

Daily cron drips the queue (only *due* items post):
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

# 2. publish (or add --post to step 1 to chain it)
IG_ACCESS_TOKEN=$(op read "op://Developer Secrets/Meta Lets Pepper Instagram Publisher/credential") \
  node scripts/social-publish/post-reels.mjs --event rdrsVB --account flickday --count 1
```

Why R2 and not the gallery's `imagedelivery.net` URLs: Cloudflare Images negotiates
to webp on a webp-Accept fetch and Instagram rejects webp. The builder fetches the
`large` variant as jpeg and re-hosts on R2 (which serves the stored type verbatim).
The `flickday-social` bucket has public dev access enabled for exactly this.

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

```bash
# feed post (IMAGE from .jpg/.png, REELS from .mp4/.mov — inferred):
node scripts/social-publish/post-now.mjs --account letspepper \
  --file /path/to/graphic.jpg --caption "..."

# story (bare media — API stories take no caption/stickers/tags):
node scripts/social-publish/post-now.mjs --account letspepper \
  --file /path/to/story.jpg --story

# preview without touching anything:
node scripts/social-publish/post-now.mjs ... --dry-run
```

Wraps the same pipeline: appends to `queue/adhoc.json` (permanent ledger),
uploads via `upload-r2.mjs` (default bucket `flickday-social`), publishes just
that item via `post-reels.mjs --id`. Reads the token from 1Password itself if
`IG_ACCESS_TOKEN` isn't set. Posts land in under a minute for images.

## Capabilities
- **Multi-account:** `--account <slug>` or per-item `account` field → posts to any owned IG account from the one token.
- **Facebook Pages:** Worker items with `"channels":["instagram","facebook"]` publish an image or Reel to the paired Page and preserve independent destination state.
- **Facebook Reel collaborators:** matching owned collaborator handles become Page collaborator invitations; invitation errors are recorded without rewriting a successful Reel receipt.
- **User tags:** item `user_tags: ["flickday.media"]` → `user_tags=[{username}]` on the post.
- **Collab:** item `collaborators: ["flickday.media"]` → co-author invite (reels/image/carousel; not Stories; public accounts only). `collaborators` is community-confirmed but not in Meta's main doc — first live call verifies it; on rejection the item is marked `error` with the API message, not silently dropped.
- **Media types:** `media_type` = `REELS` (default) | `IMAGE` (`image_url`) | `STORIES` (`image_url` or `video_url`; bare media) | `CAROUSEL` (`children: [{media_type,image_url|video_url}]`).
- **Stories:** published via the API since 2026-07-12 (Business accounts; `media_type=STORIES`). Bare media only — sticker/link/tag decoration is NOT in the API (see STORIES-SPEC.md for the decorated-firehose design). Accidental story? `DELETE /{ig-media-id}` works (verified live) — feed-media delete is unverified.

## Notes
- Queue is the source of truth; saved after every publish; posted items are skipped (no double-post).
- Reels ≤ 90s, 9:16. `share_to_feed=true` also drops reels on the grid.
- **op cleanup (deferred):** consolidate the duplicate Facebook (4) + Instagram (8) 1Password items into clean convention-named entries once the token + account truth is settled.
- **Upgrade (unattended):** move step 4 into a Cloudflare Worker cron (token as Worker secret, queue in KV/D1, media in R2). Same publish logic, no machine-on dependency.
