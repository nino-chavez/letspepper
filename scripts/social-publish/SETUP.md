# Owned Instagram publishing platform

API-first, fully controlled, no third-party SaaS. Multi-account scheduled posting with user-tagging and Collab co-author invites, over Instagram's [Content Publishing API](https://developers.facebook.com/docs/instagram-platform/content-publishing) (Graph API v25.0). Owned Playwright automation is the fallback for anything the API doesn't expose (Stories stickers/polls/links, etc.).

```
accounts.json            registry: account slug → ig_user_id (+ handle, page_id)
build-queue.mjs          folder of media → queue/<event>.json (per-account, scheduled)
build-album-carousel.mjs gallery album → R2-hosted CAROUSEL queue/<event>.json
upload-r2.mjs            push media to a public R2 bucket, write URLs into the queue
post-reels.mjs           publish due items (reels / image / carousel), tag + collab
```

## Architecture
- **One Business Manager — Almost Flickday** (`id 4033438730307424`) owns every IG account (`nino.chavez.photo`, `letspepper.open`, `flickday.media`). One ownership root.
- **One Meta app, Standard Access, one System User token.** Standard Access needs **no App Review** because every account is owned/role-connected. System User tokens **don't expire**. One token reaches every account in the BM.
- Host is **`graph.facebook.com`** (Business path) — each account addressed by its numeric `ig_user_id`. (`graph.instagram.com` is the single-account Instagram-Login path; not used here.)
- Hard API limits to design around: **Business accounts only** (Creator rejected); **can't tag private collaborators**; **Stories can't have collaborators** (→ Playwright fallback). Limit: 100 published posts / 24h / account.

---

## One-time setup

### Phase 0 — account foundation (Business Manager UI; do these yourself)
The Business settings SPA resists automation and these claim assets, so they're manual. In **business.facebook.com → Almost Flickday → Business settings → Accounts → Instagram accounts**:
1. **Add** each IG account: `nino.chavez.photo`, `letspepper.open`, `flickday.media` (log into each IG when prompted). If an account shows only under a Page, use the Page's "Connect Instagram".
2. Confirm each is a **Business** account (Settings → Account type in the IG app). Creator won't publish via API.
3. Under **Accounts → Pages**, confirm each IG is linked to its FB Page (needed to resolve `ig_user_id`).

### Phase 1 — Meta app + System User token (I automate what I can; token gen is gated by your login)
1. App: **developers.facebook.com → Create App → Instagram** product, attached to the **Almost Flickday** portfolio. (Scrap any half-built Instagram-Login app — wrong model.)
2. **Business settings → Users → System users → Add** → name e.g. `lets-pepper-publisher`, role **Admin**.
3. **Assign assets** to the System User: the app + all three IG accounts (+ their Pages), **Full control**.
4. **Generate token** for the System User with scopes:
   `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `business_management`.
   Choose **no expiration**. Copy it.
5. Store it in 1Password (`Developer Secrets` / `Meta Almost-Flickday` / field `credential`):
   ```
   op item create --category "API Credential" --vault "Developer Secrets" \
     --title "Meta Almost-Flickday" credential="SYSTEM_USER_TOKEN"
   ```

### Resolve IG user IDs → accounts.json
With the token, get each account's numeric id and write it into `accounts.json`:
```
TOKEN=$(op read "op://Developer Secrets/Meta Almost-Flickday/credential")
# list Pages you manage and their linked IG business accounts:
curl -s "https://graph.facebook.com/v25.0/me/accounts?fields=name,id,instagram_business_account{id,username}&access_token=$TOKEN" | jq
```
Paste each `instagram_business_account.id` into the matching `ig_user_id` in `accounts.json` (and `page_id`).

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
export IG_ACCESS_TOKEN=$(op read "op://Developer Secrets/Meta Almost-Flickday/credential")
node scripts/social-publish/post-reels.mjs --event $EVENT --dry-run
node scripts/social-publish/post-reels.mjs --event $EVENT --count 2
```

Daily cron drips the queue (only *due* items post):
```
5 12 * * *  cd /Users/nino/Workspace/dev/apps/letspepper && \
  IG_ACCESS_TOKEN=$(op read "op://Developer Secrets/Meta Almost-Flickday/credential") \
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
IG_ACCESS_TOKEN=$(op read "op://Developer Secrets/Meta Almost-Flickday/credential") \
  node scripts/social-publish/post-reels.mjs --event rdrsVB --account flickday --count 1
```

Why R2 and not the gallery's `imagedelivery.net` URLs: Cloudflare Images negotiates
to webp on a webp-Accept fetch and Instagram rejects webp. The builder fetches the
`large` variant as jpeg and re-hosts on R2 (which serves the stored type verbatim).
The `flickday-social` bucket has public dev access enabled for exactly this.

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
- **User tags:** item `user_tags: ["flickday.media"]` → `user_tags=[{username}]` on the post.
- **Collab:** item `collaborators: ["flickday.media"]` → co-author invite (reels/image/carousel; not Stories; public accounts only). `collaborators` is community-confirmed but not in Meta's main doc — first live call verifies it; on rejection the item is marked `error` with the API message, not silently dropped.
- **Media types:** `media_type` = `REELS` (default) | `IMAGE` (`image_url`) | `STORIES` (`image_url` or `video_url`; bare media) | `CAROUSEL` (`children: [{media_type,image_url|video_url}]`).
- **Stories:** published via the API since 2026-07-12 (Business accounts; `media_type=STORIES`). Bare media only — sticker/link/tag decoration is NOT in the API (see STORIES-SPEC.md for the decorated-firehose design). Accidental story? `DELETE /{ig-media-id}` works (verified live) — feed-media delete is unverified.

## Notes
- Queue is the source of truth; saved after every publish; posted items are skipped (no double-post).
- Reels ≤ 90s, 9:16. `share_to_feed=true` also drops reels on the grid.
- **op cleanup (deferred):** consolidate the duplicate Facebook (4) + Instagram (8) 1Password items into clean convention-named entries once the token + account truth is settled.
- **Upgrade (unattended):** move step 4 into a Cloudflare Worker cron (token as Worker secret, queue in KV/D1, media in R2). Same publish logic, no machine-on dependency.
