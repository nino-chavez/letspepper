#!/usr/bin/env bash
# Re-render every template at both sizes.
#   ./render.sh              all four
#   ./render.sh weather-notice series-schedule    a subset
#
# Edit the facts in <name>.data.json, never in the HTML. Then run this.
# A render that logs "failed to load" wrote a PNG with a missing font or image
# baked in, so that line is a failure here even though render-kit exits 0.
set -euo pipefail
cd "$(dirname "$0")"
RK="$HOME/Workspace/dev/tools/render-kit/bin/render-kit.mjs"
LOG="$(mktemp)"; trap 'rm -f "$LOG" _*.fmt.json' EXIT

bases=("$@")
if [ ${#bases[@]} -eq 0 ]; then
  bases=(registration-push weather-notice sponsor-thanks series-schedule)
fi

for base in "${bases[@]}"; do
  for spec in feed:1350 story:1920; do
    fmt="${spec%%:*}"; h="${spec##*:}"
    tmp="_${base}.fmt.json"
    python3 -c "
import json
d = json.load(open('${base}.data.json')); d['format'] = '${fmt}'
json.dump(d, open('${tmp}', 'w'), ensure_ascii=False)
"
    node "$RK" "${base}.html" --data "$tmp" --width 1080 --height "$h" \
      --out "${base}-${fmt}.png" 2>&1 | tee -a "$LOG"
    rm -f "$tmp"
  done
done

if grep -q "failed to load" "$LOG"; then
  echo "FAILED: an asset did not load — the PNGs above have a gap baked in." >&2
  exit 1
fi
echo "Rendered $(( ${#bases[@]} * 2 )) assets."
