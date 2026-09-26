/**
 * Caption for a gallery-announce carousel — facts only, from the album's own
 * display name and the count the selector reports.
 *
 * signal-dispatch-voice-guide.md v1.8 was read in full for this module (not
 * self-attested — the guide is written for long-form reflective prose, and
 * this is one factual paragraph, so most of it doesn't apply; the parts that
 * do are named here rather than claimed generically). The guide's Layer 1
 * ("Truth and evidence": separate what the source demonstrates from a
 * hypothesis — "a polished hypothesis is still a hypothesis") and its
 * cross-register invariant "keep claims attached to their actual source and
 * subject" are what rule out calling the selection "favorites" below: an
 * unattended heuristic pick is not Nino's judgment, and CLAUDE.md's rule
 * against fabricating his interior state applies the same way it would to a
 * confession he never made. The guide's Thought-Leadership register (composed,
 * provisional, first-person) does not apply — this is an announcement with no
 * point of view to hold.
 *
 * Hard rules, because the subjects here are minors and because the source data
 * has no result:
 *   - Never a player's name (nothing here is sourced anyway).
 *   - Never a result or score (not sourced — this is an announcement, not a
 *     recap; do not imply one exists).
 *   - No "tag yourselves" or any other invitation to identify someone in the
 *     photos.
 *   - letspepper.com/gallery is only linked when the album is actually in that
 *     series' scope — otherwise the direct album URL is the only link, so a
 *     personal-brand or Flickday album never points a follower at a page
 *     where this album isn't listed.
 *   - "#grassvolleyball" is only added for the letspepper (grass triples)
 *     series — Re7kho is an indoor high-school match (its own captions say
 *     "polished court"), and tagging it grass volleyball would be false, not
 *     just off-brand.
 *
 * Album metadata beyond the display name (venue, a real event date, team
 * names) has no public read path in the photography repo — album_settings
 * (which would carry gallery_scope) is read anon/server-side only, and no
 * structured venue/teams field exists in the schema at all (checked
 * 2026-09-25: only album_name and a photo date RANGE are queryable, no venue,
 * no opponent fields). parseAlbumName() below is a best-effort parse of the
 * three-part "<title> - <teams> - <MM-DD-YYYY>" shape this album (and
 * apparently others in this scope) uses; --venue/--teams/--event-date on the
 * builder override it when the parse is wrong or the shape differs.
 */

const MONTHS = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.']

/** Best-effort parse of "<title> - <teams> - MM-DD-YYYY". Returns partial results; never throws. */
export function parseAlbumName(albumName = '') {
  const parts = albumName.split(' - ').map((s) => s.trim()).filter(Boolean)
  const dateMatch = albumName.match(/(\d{2})-(\d{2})-(\d{4})\s*$/)
  let eventDateLabel = null
  if (dateMatch) {
    const [, mm, dd, yyyy] = dateMatch
    const mi = Number(mm) - 1
    if (mi >= 0 && mi < 12) eventDateLabel = `${MONTHS[mi]} ${Number(dd)}, ${yyyy}`
  }
  const teamsPart = parts.find((p) => /\bat\b/i.test(p) && !/^\d/.test(p)) || null
  const title = parts[0] || albumName
  return { title, teams: teamsPart, eventDateLabel }
}

/**
 * `series` is the routing decision already made upstream (build-gallery-announce.mjs's
 * --series/gallery_scope check) — passed in rather than re-derived here, so this module
 * has no account-routing logic of its own to get out of sync with the builder's.
 */
export function buildGalleryAnnounceCaption({
  albumName, venue, teams, eventDateLabel, galleryUrl, selectedOf, series,
}) {
  const parsed = parseAlbumName(albumName)
  const teamsLine = teams || parsed.teams
  const dateLine = eventDateLabel || parsed.eventDateLabel
  const headline = [teamsLine, dateLine].filter(Boolean).join(', ') || parsed.title

  const lines = [headline]
  if (venue) lines.push(venue)
  lines.push('')
  // "from the gallery", not "favorites" — the pick is an unattended heuristic
  // selection, not a claim about what Nino personally likes best.
  lines.push(`${selectedOf} from the gallery.`)
  lines.push('')
  if (series === 'lpo') {
    lines.push(`Full gallery: letspepper.com/gallery`)
  } else if (galleryUrl) {
    lines.push(`Full gallery: ${galleryUrl}`)
  }
  lines.push('')
  lines.push('Motion. Emotion. Frame by Frame.')
  lines.push('')
  lines.push('Photos: Nino Chavez / Flickday Media.')
  lines.push('')
  const tags = ['#volleyball', ...(series === 'lpo' ? ['#grassvolleyball'] : []), '#volleyballphotography', '#sportsphotography']
  lines.push(tags.join(' '))

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
