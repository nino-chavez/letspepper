# Deploy — letspepper

## Host
- **Platform**: Cloudflare Pages (Next.js via OpenNext adapter — `pages_build_output_dir = ".vercel/output/static"` is the OpenNext output)
- **Project name**: `letspepper`
- **Production URL**: TODO (likely letspepper.com — verify)

## Deploy trigger
- **Canonical**: `.github/workflows/deploy.yml` (CI-triggered) — workflow is the source of truth, don't run manual deploys.
- **Manual fallback**: TODO (workflow likely runs `npx opennextjs-cloudflare && wrangler pages deploy`)

## Database
- Supabase (URL hardcoded in wrangler.toml `[vars]`: `https://skywzpcekhntecegyjoj.supabase.co`)
- **Migrations**: none in repo — schema managed elsewhere or via dashboard. TODO confirm.

## Environment variables
- **In wrangler.toml `[vars]`**: SUPABASE_URL, NEXT_PUBLIC_CF_STREAM_SUBDOMAIN (public, OK to be committed)
- **Cloudflare Pages secrets**: Supabase anon key, service role key, Cloudflare Stream tokens — TODO list exact names
- **Where they live**: Cloudflare Pages dashboard

## Domains
- TODO

## Preflight checks
- `git status` clean
- `npm run build` succeeds locally

## Verify after deploy
- Watch GH Actions run for `deploy.yml`
- `curl -fsSL https://letspepper.com` returns 200

## Authority limits
- Cannot trigger GH Actions without auth

## Notes
- Next.js 14 + OpenNext Cloudflare adapter
- Cloudflare Stream integration for video hosting
