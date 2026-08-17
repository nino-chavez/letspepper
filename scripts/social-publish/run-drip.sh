#!/bin/zsh
# Drip runner for the launchd agent. Posts any due reels for the event.
# Token is read from 1Password at runtime (never stored on disk).
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin"
REPO="/Users/nino/Workspace/dev/apps/letspepper"
EVENT="${1:-}"
LOG="/tmp/lp-reels.log"

# Require an explicit event. Previously this defaulted to bell-pepper-2026, so a
# stray argless run would silently start dripping that queue's backlog. Each
# launchd agent passes its own event, so refusing the default breaks nothing
# intentional and removes the accidental-letspepper-drip footgun.
if [[ -z "$EVENT" ]]; then
  echo "$(date) FATAL: no event arg — refusing to default (pass the event slug explicitly)." >> "$LOG"
  exit 1
fi

cd "$REPO" || { echo "$(date) FATAL: repo not found" >> "$LOG"; exit 1; }

TOKEN="$(op read "op://Developer Secrets/Meta Lets Pepper Instagram Publisher/credential" 2>>"$LOG")"
if [[ -z "$TOKEN" ]]; then
  echo "$(date) FATAL: could not read token from 1Password (op not authorized in this context?)." >> "$LOG"
  exit 1
fi

# --count 1: laptop launchd coalesces missed runs on wake; capping at 1/run
# prevents a slept-through backlog from firing several posts seconds apart
# (a worse spam signal than the intended spread). Runs hourly; catches up gradually.
echo "$(date) --- drip run ($EVENT) ---" >> "$LOG"
IG_ACCESS_TOKEN="$TOKEN" node scripts/social-publish/post-reels.mjs --event "$EVENT" --count 1 >> "$LOG" 2>&1
echo "$(date) --- done ---" >> "$LOG"
