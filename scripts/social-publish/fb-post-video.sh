#!/usr/bin/env bash
# Post one video to the logged-in Facebook personal timeline, with a resolved
# Page mention. Personal profiles are unreachable from the Graph API (Meta:
# "You can only publish Reels to Facebook Pages"), so this drives the composer.
#
#   BROWSE_PORT=9400 ./fb-post-video.sh /media/clip.mp4 "caption body" "Flickday Media"
#
# Runs against a browser-box (see tools/browser-box) so nothing appears on the
# operator's screen. The video path is the path INSIDE that container — start
# the box with --mount <dir> and reference /media/<file>.
set -euo pipefail

VIDEO="${1:?video path inside the container}"
BODY="${2:?caption body}"
PAGE="${3:-Flickday Media}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export FB_PAGE_MATCH=facebook.com
# No apostrophes in this message: bash re-parses the word inside ${var:?word},
# so a lone quote there opens a context that never closes and the whole file
# fails to parse — reported at the end of the script, far from the cause.
: "${BROWSE_PORT:?set BROWSE_PORT to the CDP port of the browser-box}"
export BROWSE_PORT

fb() { node "$HERE/fb-composer.mjs" "$@" >/dev/null 2>&1 || true; }

# JS arrives on stdin so nothing has to survive two layers of shell quoting, and
# every snippet lives in a function rather than a heredoc inside $( ) — bash
# mis-scans for the closing paren when quotes appear in an inline heredoc body,
# which is a parse error, not a runtime one.
ev() { browse-eval --stdin 2>/dev/null | tr -d '"'; }

DIALOG="const d=[...document.querySelectorAll('[role=dialog]')].filter(e=>e.offsetParent).find(e=>/Create post/.test(e.innerText));"

js_photo_button() {
  echo "$DIALOG"
  cat <<'JS'
if(!d) return '';
const b=[...d.querySelectorAll('[role=button],[aria-label]')].filter(e=>e.offsetParent)
  .find(e=>/^Photo\/video/.test((e.getAttribute('aria-label')||e.innerText||'').trim()));
if(!b) return '';
const r=b.getBoundingClientRect();
return Math.round(r.x+r.width/2)+' '+Math.round(r.y+r.height/2);
JS
}

# Readiness means THE VIDEO IS ATTACHED, and the only trustworthy evidence is
# the composer echoing the filename back. Two probes were wrong before this one:
# the Post button (plain text enables it, so a failed upload sailed through and
# would have posted a caption alone), and querySelector('video') — the composer
# renders an un-played attachment as a thumbnail with a play affordance, NOT a
# <video> element, so that probe never matched even on uploads that succeeded
# and posted fine. Returning the text and matching the basename in bash also
# avoids interpolating a filename into evaluated JS.
js_dialog_text() {
  echo "$DIALOG"
  cat <<'JS'
return d ? d.innerText.replace(/\n+/g,' ') : '';
JS
}

js_editor() {
  cat <<'JS'
const e=document.querySelector('[role=dialog] [role=textbox]');
if(!e) return '';
const r=e.getBoundingClientRect();
return Math.round(r.x+r.width/2)+' '+Math.round(r.y+r.height/2);
JS
}

js_mention_option() {
  cat <<'JS'
const lb=[...document.querySelectorAll('[role=listbox]')].filter(e=>e.offsetParent);
const o=lb.flatMap(l=>[...l.querySelectorAll('[role=option]')])[0];
if(!o) return '';
const r=o.getBoundingClientRect();
return Math.round(r.x+r.width/2)+' '+Math.round(r.y+r.height/2)+' '+o.innerText.split('\n')[0];
JS
}

js_mention_resolved() {
  cat <<'JS'
const tb=document.querySelector('[role=dialog] [role=textbox]');
if(!tb) return '0';
return String([...tb.querySelectorAll('span')].filter(s=>s.getAttribute('spellcheck')==='false').length);
JS
}

js_post_button() {
  echo "$DIALOG"
  cat <<'JS'
if(!d) return '';
const b=[...d.querySelectorAll('[role=button]')].find(x=>x.innerText.trim()==='Post');
if(!b) return '';
const r=b.getBoundingClientRect();
return Math.round(r.x+r.width/2)+' '+Math.round(r.y+r.height/2);
JS
}

js_composer_open() {
  cat <<'JS'
return [...document.querySelectorAll('[role=dialog]')].filter(e=>e.offsetParent)
  .some(e=>/Create post/.test(e.innerText)) ? 'open' : 'closed';
JS
}

echo "-> $(basename "$VIDEO")"
# Start from a guaranteed-clean page. A failed run leaves its composer mounted,
# and Facebook keeps dismissed dialogs in the DOM — so a second run finds two
# "Create post" dialogs and every coordinate lookup may resolve against the
# wrong one. Escape first, then a real reload, then confirm none survive.
fb esc; sleep 1
fb goto "https://www.facebook.com/"; sleep 4
for i in $(seq 1 5); do
  [ "$(js_composer_open | ev)" = "closed" ] && break
  fb esc; fb goto "https://www.facebook.com/"; sleep 4
  if [ "$i" = 5 ]; then echo "   could not clear a stale composer" >&2; exit 1; fi
done
fb click "What's on your mind" partial; sleep 3

# Coordinates are read live rather than hardcoded: dialog geometry shifts with
# caption length and viewport, and a stale constant clicks the feed behind the
# modal instead — which fails as a silent no-op, not an error.
read -r PX PY <<<"$(js_photo_button | ev)"
[ -n "${PX:-}" ] || { echo "   Photo/video button not found" >&2; exit 1; }
fb uploadxy "$PX" "$PY" "$VIDEO"

# Wait for the attachment to register rather than sleeping a guessed interval —
# upload time scales with file size.
VIDEO_NAME="$(basename "$VIDEO")"
for i in $(seq 1 40); do
  case "$(js_dialog_text | ev)" in
    *"$VIDEO_NAME"*) break ;;
  esac
  sleep 3
  if [ "$i" = 40 ]; then
    echo "   upload never completed (composer never showed $VIDEO_NAME)" >&2
    exit 1
  fi
done

read -r EX EY <<<"$(js_editor | ev)"
[ -n "${EX:-}" ] || { echo "   composer editor not found" >&2; exit 1; }
fb typexy "$EX" "$EY" "$BODY"
sleep 2

# The mention must be typed, never pasted or re-clicked into: re-focusing the
# editor after the "@" dismisses the typeahead, and posting on an unresolved
# mention puts a dead "@Name" on a public timeline.
fb append "

More from the day at @$PAGE" 130
sleep 4

# The page name is matched here rather than interpolated into the JS: injecting
# a shell variable into an evaluated script means escaping it for two parsers.
read -r MX MY MLABEL <<<"$(js_mention_option | ev)"
[ -n "${MX:-}" ] || { echo "   no mention typeahead appeared" >&2; exit 1; }
case "$MLABEL" in
  *"$PAGE"*) ;;
  *) echo "   typeahead offered '$MLABEL', not '$PAGE' — refusing" >&2; exit 1 ;;
esac
fb clickxy "$MX" "$MY"; sleep 2

if [ "$(js_mention_resolved | ev)" -lt 1 ]; then
  echo "   mention did not resolve — refusing to post an unlinked @name" >&2
  exit 1
fi

read -r BX BY <<<"$(js_post_button | ev)"
[ -n "${BX:-}" ] || { echo "   Post button not found" >&2; exit 1; }
fb clickxy "$BX" "$BY"

for i in $(seq 1 20); do
  if [ "$(js_composer_open | ev)" = "closed" ]; then echo "   posted"; exit 0; fi
  sleep 3
done
echo "   composer still open after posting — check the viewer" >&2
exit 1
