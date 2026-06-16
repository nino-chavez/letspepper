# Engagement Sweep — comment + DM automation for the Worker

Extends `letspepper-reels-worker` from publish-only to **publish + engage**. Same
Graph host (`graph.facebook.com/v25.0`), same System User token, same per-account
`ig_user_id`s. No webhooks — we **poll on the existing hourly cron** (Standard Access,
owned accounts, no App Review). Sweep runs *after* the post step in an isolated
`try/catch` so an engagement failure can never block a post.

This is **two capabilities with different scopes and risk**. They ship in two phases.

---

## v1 — Comment surface (one scope, no gates, fully documented)

Get / public-reply / hide / delete comments **and** the comment-triggered private
reply (DM to a commenter). Per the docs: the private reply hits `POST /{ig}/messages`
but is authorized by **`instagram_manage_comments`**, *not* `instagram_manage_messages`.
So the whole v1 surface is one scope the token doesn't yet have.

### Scopes
Current token (`Meta Almost-Flickday`): `instagram_basic`, `instagram_content_publish`,
`pages_show_list`, `pages_read_engagement`.

v1 **adds**: `instagram_manage_comments`. (`pages_read_engagement` already present.)

### Endpoints used
```
GET    /{ig_user_id}/media?fields=id,timestamp&limit=25        # recent media
GET    /{media_id}/comments?fields=id,text,username,timestamp,from,replies{from}&limit=50
POST   /{comment_id}/replies      { message }                  # public reply
POST   /{ig_user_id}/messages     { recipient:{comment_id}, message:{text} }  # private reply, 7-day window, once only
POST   /{comment_id}              { hide: true|false }          # hide spam
DELETE /{comment_id}                                            # delete
```

### What it does each sweep (per owned account)
1. List recent media; keep only media with `timestamp` within `SWEEP_LOOKBACK_DAYS`
   (default 14 — public reply/hide stay useful past the 7-day DM window).
2. List comments on each. For each comment, dedupe against KV (below). Skip our own
   comments and any comment that already has a reply `from` one of our handles.
3. **Classify intent** (signup/price/where keywords → `signup`; everything else →
   `other`). Classifier always runs.
4. **Act per `SWEEP_AUTOREPLY`:**
   - `off` (default) — **shadow mode**: log what it *would* send into the digest, send nothing.
   - `intent` — on a `signup` match, send ONE private reply with `REGISTRATION_URL`.
     Never auto-replies to `other`. (Reply-to-everything is deliberately not a mode —
     it's the spammy/brand-risk path; if ever wanted it's a separate, justified change.)
5. Append every new comment (+ shadow decision) to the notify digest.
6. Write the comment's KV dedupe key.

### Intent classifier (v1, deliberately dumb)
Regex over lowercased text. Editable without redeploy via KV key `engage:config`:
```jsonc
{ "signup": ["sign ?up","register","how (do|can) (i|we) (join|sign|enter)",
             "where.*(sign|register|enter)","how much","entry fee","cost","price","\\$"],
  "reply_text": "Thanks for the interest! Register here: {REGISTRATION_URL}" }
```
Falls back to baked-in defaults if the key is absent.

---

## Phase 2 — DM inbox (gated, access level UNVERIFIED)

Reading `/conversations` and replying to DMs **not** tied to a comment. Needs a
**different scope** (`instagram_manage_messages`) and the messaging-API reference page
404'd during research — **do not assume Standard Access here.** IG messaging access has
historically been stricter than comments. Before building Phase 2:

1. Fetch the conversations reference page that loads; confirm the access level for
   owned accounts. If it requires Advanced Access + Business Verification, that's the
   gate, and Phase 2 waits on verification (same gate webhooks would need).
2. Per-account IG-app setting **Settings → Messages → "Allow Access to Messages"** must
   be ON or `/conversations` returns empty. Hand this micro-step to Nino per account
   (same pattern as the existing IG-side-connect gotcha).

Endpoints (pending the access check):
```
GET  /{ig_user_id}/conversations?platform=instagram&fields=participants,messages{...}
POST /{ig_user_id}/messages   { recipient:{id}, message:{text} }   # 24-hr standard window
```
Phase 2 reuses v1's dedupe + digest + shadow-mode machinery; DMs default to
notify-only regardless of `SWEEP_AUTOREPLY` until explicitly opted in.

---

## KV dedupe model (self-pruning)

One key per handled comment, namespace = existing `QUEUE` (or a new `ENGAGE` binding):
```
engage:c:{comment_id}  ->  "1"   expirationTtl = 8 days   # just past the 7-day reply window
```
Presence ⇒ already handled. TTL auto-prunes; no unbounded seen-list. Phase 2 mirrors
with `engage:m:{message_id}`.

**Write discipline (mirror `publishWithRetry`):** attempt the action, then write the
seen-key on success **and** on Meta's "already sent / only one message" error. Meta caps
private replies to one per comment, so a double attempt errors *safely* rather than
double-sending. Never write the key before a send that could still fail legitimately.

Digest store: rolling KV key `engage:digest` holding the last N events (capped array),
flushed to the notify sink each sweep.

---

## Notify sink — must be a PUSH Nino actually sees

A pull-only `/inbox` endpoint goes unread. Use **Cloudflare Email** (already in-platform)
as `NOTIFY_WEBHOOK_URL`'s alternative: each sweep with new activity sends a digest email
(new comments, intent matches, and — in `off` mode — every "would have sent" shadow line).
`/inbox?key=` still exists for ad-hoc pulls, but email is the primary surface.

---

## Worker wiring

```js
async scheduled(_c, env, ctx) {
  ctx.waitUntil((async () => {
    await run(env)                                  // post step — unchanged, runs first
    if (env.SWEEP_ENABLED === '1') {
      try { await sweep(env) } catch (e) { console.error('sweep failed', e) }  // isolated
    }
  })())
}
```
New fetch routes: `/sweep?key=` (manual trigger), `/inbox?key=` (digest JSON).

### Config
`wrangler.jsonc` vars:
```jsonc
"SWEEP_ENABLED": "1",
"SWEEP_LOOKBACK_DAYS": "14",
"SWEEP_AUTOREPLY": "off",        // off | intent — DEFAULTS OFF
"REGISTRATION_URL": "https://letspepper.com/..."
```
Secrets (`wrangler secret put`): `NOTIFY_EMAIL_TO` (or reuse `TRIGGER_KEY` guard on `/inbox`).

---

## Rollout

0. **Token re-auth (blocks everything).** Regenerate the System User token WITH
   `instagram_manage_comments` added. **Fold in the pending token rotation** (memory
   open-item: the current token was pasted plaintext) — one re-auth does both. Update
   1Password `Meta Almost-Flickday`, then `wrangler secret put IG_ACCESS_TOKEN`.
1. Ship v1 with `SWEEP_ENABLED=1`, `SWEEP_AUTOREPLY=off`. Sweep runs, collects, emails
   digests, shadow-logs intent matches. Sends nothing outward.
2. **Decision point:** after a few cycles, review the shadow log. If the intent
   classifier's `signup` matches are clean, flip `SWEEP_AUTOREPLY=intent`. This is the
   one outward-facing, not-fully-reversible switch — auto-DMing the public — so it stays
   manual on purpose.
3. Phase 2 (DM inbox) only after the access-level check above resolves.

---

## The one decision for Nino

Everything above ships and runs immediately in shadow mode. The only gated knob is
**when to flip `SWEEP_AUTOREPLY` from `off` to `intent`** — i.e. when to let the Worker
auto-DM a registration link to people who comment asking how to sign up. Recommendation:
ship off, watch one event's worth of shadow matches, then flip.
