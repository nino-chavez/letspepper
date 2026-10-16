# Deploy — letspepper

The one owner of deploy facts for this repo. README.md, CLAUDE.md and AGENTS.md point here. Facts marked "verified" were checked against the Cloudflare Pages API or the live site on 2026-10-09.

## Host
- **Platform**: Cloudflare Pages. Next.js 14 is built with `@cloudflare/next-on-pages`, which writes `.vercel/output/static` (`pages_build_output_dir` in `wrangler.toml`). That path is next-on-pages' input format, not a Vercel deployment.
- **Project name**: `letspepper`
- **Production URL**: https://letspepper.com (verified)

## Deploy trigger
- **Canonical**: Cloudflare Pages' GitHub connection (verified). A merge to `main` builds and deploys production. A push to any other branch builds a preview on `letspepper.pages.dev`, and Cloudflare posts the URL on the PR.
- **Build command** (Pages project settings): `pnpm install --frozen-lockfile && pnpm dlx @cloudflare/next-on-pages@1`. A failed build leaves the previous deploy live.
- **History**: until 2026-10-09 a GitHub Actions workflow (`deploy.yml`) also deployed every merge, so most commits went live twice. #73 removed it.
- **Manual fallback** (emergency only). It skips the PR checks, and the next merge replaces it. The dummy project settings keep `vercel build` offline (CLI 56+ otherwise tries to link a Vercel project, which needs auth and creates one as a side effect):

  ```bash
  mkdir -p .vercel
  echo '{"projectId":"_","orgId":"_","settings":{"framework":"nextjs"}}' > .vercel/project.json
  pnpm dlx vercel build --yes
  pnpm dlx @cloudflare/next-on-pages@1 --skip-build
  pnpm dlx wrangler pages deploy .vercel/output/static --project-name=letspepper --branch=main
  ```

## Social scheduler

The site and scheduler deploy separately. `.github/workflows/deploy-social-worker.yml` runs the publisher and scheduler tests on every pull request that touches `scripts/social-publish`, and tests then deploys `letspepper-reels-worker` after relevant changes merge to `main`. Its pull-request run is not one of the three required checks, so read its result before merging. It uses the existing `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` GitHub secrets; absent credentials skip with a notice. Platform build connections could not be verified with the account-ops token, so this test-gated workflow owns scheduler deployment.

`scripts/social-publish/worker/wrangler.jsonc` owns both crons, the queue and insights database bindings, and campaign priority. The hourly cron publishes. The daily cron only reads Instagram insights into the `social-insights` D1 database ([`INSIGHTS.md`](scripts/social-publish/INSIGHTS.md)). Before each deploy, the workflow applies `scripts/social-publish/worker/migrations` to that database, which needs D1 edit permission on `CLOUDFLARE_API_TOKEN`. Publisher credentials remain Worker secrets. Approved queues reach production through `scripts/social-publish/seed-kv.mjs`; deploying code does not seed a queue. Verify the deployment run, remote Worker bindings and both crons, then `/status` and `/insights/status` with the existing trigger credential. Never call `/run` to verify a schedule: it can publish due content. `/insights/run` only reads.

The read-only Instagram dashboard, `630-instagram-insights`, deploys separately through `.github/workflows/deploy-insights-dashboard.yml` from `scripts/social-publish/insights-dashboard`. It shares the insights database and never applies migrations. Its `DASHBOARD_PASSPHRASE` secret comes from `Cloudflare 630-instagram-insights` in 1Password; without it the page refuses every sign-in. See `INSIGHTS.md`, "The dashboard".

For 630, `IG_630_ACCESS_TOKEN` comes from `Meta 630 Publisher` in 1Password. Missing that binding fails before any Graph call. It cannot fall back to the owned-account credential. This Instagram grant does not enable Facebook publishing or engagement sweeps for 630. When that 1Password item is renewed, replace the Worker secret as well (see `INSIGHTS.md`, "The token"); until then the Worker keeps using the old token.

## Database
- Supabase (URL in `wrangler.toml` `[vars]`: `https://skywzpcekhntecegyjoj.supabase.co`)
- **Migrations**: none in repo — schema managed elsewhere or via dashboard. TODO confirm.

## Environment variables
- **In `wrangler.toml` `[vars]`**: `SUPABASE_URL`, `NEXT_PUBLIC_CF_STREAM_SUBDOMAIN` (public, OK to be committed)
- **Pages project, production** (verified): `NEXT_PUBLIC_CF_STREAM_SUBDOMAIN`, `NODE_VERSION`, `PNPM_VERSION`, `RALLY_HQ_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Pages project, preview** (verified): the same, without `RALLY_HQ_API_KEY`
- **Where they live**: Cloudflare Pages dashboard, Settings > Variables
- **Build cache override**: `wrangler.toml` owns `NPM_CONFIG_CACHE=/tmp/letspepper-npm-cache`. Pages replaces dashboard plain-text variables with the Wrangler file before installing tools, so an API-only override does not reach Corepack bootstrap. This isolates npm from the restored home-directory cache; checksum validation stays enabled. Verify the cache path in the hosted build log when diagnosing an install failure.
- **pnpm is pinned twice. Keep both equal**: `PNPM_VERSION` here (Cloudflare's build image does not read `packageManager`), and `packageManager` in `package.json` (the PR checks read it).

## Domains
- `letspepper.com`, `www.letspepper.com`, `letspepper.pages.dev` (verified)

## Preflight checks
These run on every PR. The `auto-merge-gate` ruleset on `main` requires them to pass before a merge:
- **`checks`** (`.github/workflows/pr-checks.yml`): frozen-lockfile install, mascot derivative check, website reader-clarity check
- **`Cloudflare Pages`**: the branch's preview build
- **`GitGuardian Security Checks`**

**The reader-clarity check.** It compares the reader-facing copy in the branch's `src/app`, `src/components` and `src/lib` (the folders `reader-contract.json` lists for the website) with the copy recorded in the last review, `docs/reader-audits/website.json` (`"fingerprint": "copy"` in the contract). Copy is JSX text, every string and number a page can show (links, image sources, alt text, aria labels, data strings, prices and dates written as numbers), and the image files themselves. Class names, styles, imports, comments and code without strings or numbers do not count, so a layout or logic-only change passes. The check fails with `manual-review-stale` when the copy differs, whichever PR changed it. It cannot see logic that changes which existing text appears (for example a condition that swaps one blurb for another): walk those changes on the preview anyway. To see what counts as copy in a file, run `node tools/lib/copy-segments.mjs <file>`. To clear a stale check:
1. Walk the changed pages on the branch preview against [`reader-contract.json`](reader-contract.json).
2. Record the review on the branch.
3. Commit the receipt with the change.

```bash
node tools/lib/encounter-audit.mjs --root=. --record-manual=website \
  --reviewed-by="<who>" --method="<what was walked, and how>" --scope="home|about"
```

Record a review only after walking the pages. The receipt is the only evidence that someone read the copy the way a player meets it.

## Verify after deploy
- Pages API `/accounts/{id}/pages/projects/letspepper/deployments`, newest first: `latest_stage.status` is `success` for the merge commit. Or check the project in the Cloudflare dashboard.
- `curl -fsSL https://letspepper.com` returns 200

## Authority limits
- Production deploys only from `main`, through Cloudflare's GitHub connection.
- Merging needs the three required checks. Repository admins can bypass the ruleset.
- The manual fallback needs a Cloudflare API token with Pages edit access.

## Notes
- Next.js 14 + `@cloudflare/next-on-pages`
- Cloudflare Stream integration for video hosting
