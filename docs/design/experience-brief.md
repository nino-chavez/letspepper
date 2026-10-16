# Make Instagram results useful to a club operator

Status: blended direction selected by Nino, 2026-10-16. Design intent: `rethink`.
Open the [clickable study](../../research/design-explorations/instagram-dashboard/index.html).
It uses invented data. Production remains unchanged. The selected blend is the default.

## Recommendation

Give operators four pages: **Overview, Posts, Stories, Audience**. Put **Data status**
in the utility navigation and **Help with this page** beside each page title. Keep a
single help drawer that opens to the exact metric or question the reader selected.

Overview starts with an operator's question, explains why it matters, then shows the
answer, its evidence and limits, and what to inspect next. Posts and Stories help the operator choose
content to learn from. Audience describes the people who follow the account. Each
page owns its dates so the reader never has to remember an exception to a global filter.

This is the recommended structure, not a measured claim that it is optimal for all
operators. A short task-based review with a director and a content operator must test it.

## Reader and job

- Reader: a club director, staff member, or person preparing social content.
- Assumed knowledge: knows the club and Instagram posts; need not know analytics terms,
  the collector, Meta's API, or the history of this project.
- Plainness: lay for the UI, practitioner for implementation notes in this document.
- Job now: understand whether more accounts are seeing content, how followers changed,
  which posts merit a closer look, and whether missing data limits that decision.
- Job next: inspect a post, compare like content, check a link in Instagram, or bring a
  bounded question to the person planning content. The dashboard does not publish.
- People: readers share the existing passphrase; there are no individual roles, assigned
  tasks, or approval states in the current product.
- Context: a weekly desktop review or a quick phone check between club duties.
- Precision locks: accounts are not people; reach is unique only within its reported
  period; views can repeat; post totals are lifetime as last observed; null is not zero;
  source, reporting day, collection time, comparison dates, and coverage stay explicit.
- Copy sources: `insights-dashboard/src/page.js`, `data.js`, collector metric names and
  states, database captions and timestamps. Captions are escaped third-party text.
- Writing mode: Documentation. Carry clarity, evidence, and attribution rules from the
  Signal Dispatch guide; do not import its essay cadence into buttons and labels.

## What the current screen makes harder

Checked the signed-in production page and source at `ba3c7be` on 2026-10-16.
Private captures stay in the main checkout's ignored `.artifacts/insights-redesign/`.
Do not copy their real analytics or captions into this public repository.

| Encounter | Effect | Smallest useful change |
|---|---|---|
| “Lately” and “Last 30 days” lead the same summary | The reader must reconcile two time windows before knowing the answer | One selected comparison window, with exact dates |
| Posts, Stories, and audience share one long page | Weekly checks require scrolling past unrelated jobs | Four named destinations with page-local dates |
| “This list doesn't follow the period above” | The interface breaks the filter's promise | Stories owns its own explicit window |
| “Most viewed first” plus six metrics per card | Popularity becomes the default objective; cross-post comparison requires zigzag reading | A table with metric choice, limited columns, and post details |
| “Still growing” versus “At least 7 days old” | Implies older totals are final and equally comparable | Published age and actual last reading; lifetime scope stays visible |
| Failure detail is in the footer, while the header says “updated” | A recent failed attempt can look like fresh data | Last successful reading, data-through date, and affected coverage |
| Explanations sit in long paragraphs | Operators must read everything to understand one number | Short meaning beside the metric; deeper help in context |

At the captured viewport the page was 4,545 CSS pixels tall on desktop and 7,346 on
a 390-pixel phone. These are layout measurements, not analytics or usability outcomes.

## Surfaces

- Overview: account trend, follower change, and the next useful inspection.
- Posts: feed posts and Reels, searchable and sortable for a specific question.
- Post detail: the selected post, metric meanings, age, and observation times.
- Stories: time-limited content with capture completeness visible.
- Audience: current follower distribution and follower change.
- Data status: what was read, what is missing, and who can resolve it.
- Help drawer: contextual explanations and instructions without losing place.
- Sign-in: existing access model, with a plain description of the dashboard.

## Character, density, and hierarchy

Character: plainspoken, club-specific, restrained, inspectable, practical.
Anti-goals: a marketing score, a wall of charts, an automated strategist, a publishing
console, or an engineering monitoring screen.

Desktop Overview: one main finding, one trend chart, two supporting facts, and one next
step in roughly the first 900-pixel view. Up to two desktop views total. Posts: eight
comfortable rows before pagination; four decision columns at most. Phone: one column,
the main finding and next action before the long detail. Help: one question per opening,
with related topics below. New overview sections must replace an existing section.

Order: account and date context; data problem if one changes the answer; main finding;
evidence; next step. Status colors never stand in for words. A rise is not automatically
good, and a fall is not automatically a failure.

Use the 630 club brand from `630-marketing-automation/standards/brand-guide.md`, not
Let's Pepper's heat colors or the 630 coaching-app preset. Red `#b01c2e` identifies the
primary action. Blue `#2b7bb9` carries information and charts. Darker blue may be used
for small text to meet contrast. Light surfaces, dark body copy, light-weight headings,
square primary buttons. Retain the dashboard's Helvetica Neue / Arial fallback until
the licensed club face is approved for this host. No new logo variant.

Fixed light theme. Standard web navigation and native scrolling. No decorative motion
in this study: state changes are immediate; focus and a visible status confirm them.
Desktop uses a left navigation rail; phone uses four wrapping navigation links. Help
uses a right modal drawer on desktop and a full-height modal on phone. Escape closes;
focus is contained and returns to the trigger. No auto-opening tour.

## Selected blend and the three source concepts

Nino selected the blend in this chat on 2026-10-16: “i like the concept of a question
led view since it helps the operator understand why they are looking at the data but
i like the nav style of concept A and C”. This is the human direction decision; it
does not claim operator task success or approve a particular production data reading.

The selected study combines B's question-led Overview with the persistent left
navigation from A/C. Page names stay familiar: Overview, Posts, Stories, Audience.
Inside a page, question headings and short purpose statements explain why the data
is there. Each Overview question has a specific answer, evidence, limit, and next
inspection. On a phone, a compact question chooser replaces the desktop question row.

Graft record:

- From B: selectable operator questions and explanations of why each measure matters.
  Leave out B's horizontal primary navigation; it is not the selected navigation style.
- From A: the left navigation, clear main answer, visible data limits, and one next
  inspection. Leave out an unsolicited weekly verdict before the reader's question.
- From C: the compact comparison table inside the content question and Posts page.
  Leave out a ranking as the universal home, because it does not explain the account.

The original three concepts remain available in the study for reference. No new
concept-selection round is required to continue within this blended direction.

Each is rendered with the same invented numbers and the same complete, incomplete,
outdated, and empty states. Switch concepts and states in the study's review bar.

| Concept | Starting point | Strength | Cost |
|---|---|---|---|
| A. Weekly brief | A main finding, one chart, then an inspection | Best default for someone arriving without an analytics question | Requires carefully bounded finding rules |
| B. Questions | “Are more accounts seeing us?”, “What should we learn from?”, “How did follower numbers change?” | Makes the purpose of each measure explicit | Readers must choose a question before seeing the full situation |
| C. Content desk | Posts first, with the account trend beside them | Fast for the person preparing next week's content | Directors may mistake successful posts for account-wide improvement |

The initial recommendation was A. Nino's selection above supersedes that recommendation:
questions now organize Overview, while the page navigation remains visible. Content
stays one click away and can also be explored through the content question.

Tested against cases: weekly check, choosing content to repeat, missing comparison,
outdated data, and an empty account. A can answer the weekly check without navigation;
all three must withhold conclusions when data is incomplete. C is quicker for content
inspection but makes the first-time account review harder. This is design reasoning,
not observed operator task performance.

## Page and component plan

### Overview — understand the week and choose the next inspection

Default: the latest seven days outside the two-day revision buffer, compared with the
seven before. Exact dates must be visible. Offer 7 and 30 days, plus custom dates only
if implemented completely. Recent days can be included deliberately; mark them “May
still change.” Do not quietly move the selected dates backward when collection fails.
All recorded belongs in an analysis view, with no artificial previous-period comparison.

Components, in order:

1. Account name, period, comparison dates, data-through date; Help and Data status.
2. A question chooser: “Are more accounts seeing us?”, “What should we learn from?”,
   and “How did follower numbers change?”. Reach is selected on first arrival.
3. For the selected question: a short explanation of why it matters, then one
   evidence-backed answer, such as “More accounts saw 630 on a typical day.”
4. In the reach answer: typical daily reach, current and previous value, with a plain
   definition of median, and an action to inspect posts from the selected week.
5. A small daily line chart: real dates, zero baseline, gaps for missing days, dashed
   revision-buffer points, and a table alternative. No smoothed curve through gaps.
6. In the follower answer: “42 followed · 30 unfollowed · 12 net new follows.” These example
   numbers are invented. Show current follower count separately with its own date.
7. In the content answer: a compact table of posts ordered by saves, with lifetime
   scope, publication age and reading dates. One next inspection: “Review the posts
   people saved.” State why this is useful,
   then use “Compare posts by saves” to open Posts with the same period and `sort=saves`. This is an inspection,
   not a claim that copying the post will grow registrations.

No universal health score, projected growth, engagement-rate ring, or conversion funnel.
No causal claim tying a reach spike to a post just because their dates overlap.

### Posts — find content worth learning from

Navigation label: “Posts”. Page question: “Which posts are worth learning from?”.
Purpose: “Use saves, shares, or reach to choose content for a closer look.” The date
row explains that results are totals since publication, as last read. Controls: publish-date window, All / Reels / Carousels / Photos,
caption search, and “Compare by” (Reach, Saves, Shares, Views). Default Reach; choose
Saves when arriving from the corresponding next-step link.

Table: post label and caption excerpt; published date; chosen metric; last read. Show
one or two secondary measures only when they help the selected comparison. Right-align
numbers. Missing sorts last and reads “Not reported”. An empty search says “No posts
match these filters” with Clear filters. Older posts can have older readings: name it.

Post detail is an anchored route or modal with a stable URL, not a second help drawer.
Show caption, format, published timestamp, per-metric observation times, the six common
metrics, and applicable Reel or feed metrics. Keep unavailable metrics out of cross-format
comparisons. “Open on Instagram” opens the stored permalink. Back restores filters,
sort and scroll. A thumbnail is desirable for recognition, but the current schema does
not store media or thumbnail URLs: do not fake one or promise it without a collector change.

Persistent coverage note above the list: “Posts started by another account, including
some Collabs, are missing here.” Link to the explanation. Do not rank these as all of
630's content. No “best post” label unless the measure and eligible set are stated.

### Stories — read temporary content with honest limits

Page question: “What did people do after seeing a Story?”. Explain that these actions
help choose what to inspect; link taps alone do not establish registrations.

Own window: “Stories recorded in the last 7 days”, plus recording-start date. Do not
inherit Overview's date selector. Newest first by default. Each row shows posting time,
Live / Expired, accounts reached, link taps if reported, and last successful reading.
“Expired” describes the Story, never the finality of its metrics.

Details separate “Next slide”, “Next account's Story”, “Back”, and “Exited Stories”.
Do not combine tap-forward and swipe-forward into one judgment about content quality.
No completion rate without a defined sequence and compatible denominator. Link taps
do not equal registrations. A missing link metric does not mean zero taps or no sticker.

Show missed-reading periods beside the list. “No Stories were captured” is distinct
from “No Stories were posted”; collection cannot prove the latter.

### Audience — distinguish growth from a current snapshot

Page question: “How is our audience changing?”. Explain that the trend and the latest
snapshot answer different questions. Two clear sections. “Follower change” uses the chosen date range and paired daily or
weekly bars for follows/unfollows, plus the net in text. Show clipped weeks as partial,
not as fully comparable weeks. “Who follows 630” uses its own snapshot date and is not
affected by the trend selector.

Cities: ranked horizontal bars, exact counts, the limit of the returned city list.
A table beats a map for this job. Age: ordered horizontal bars, including unavailable
categories only as such. Gender: optional expanded detail; do not give it headline weight.
Never infer parents, athletes, leads, bots, or hacked accounts from these aggregates.
No “best time to post” until online-hour timezone and coverage are verified. Afterwards,
label it “When followers were online”, an input to a test, not a promised optimum.

### Data status — useful to a reader, specific enough for the maintainer

Page question: “Can I rely on these results?”. This is a secondary destination, not a
fifth main task. Show Daily activity, Posts, Stories, and
Audience separately: data through, latest successful reading, latest attempt, coverage,
and plain status. A successful run does not certify all older posts are current.

Translate `partial` to “Some results are missing”; `token_invalid` to “Instagram access
needs renewal”; `missing_scope` to “Instagram has not granted access to these results”;
`error` to “The latest update failed”. Keep the technical detail under “For the maintainer”.
Show what the reader can still trust and the next owner action. Don't show Retry to a
reader when no authorized refresh endpoint exists. Existing scheduled collection continues.

## Help that answers the question beside the number

Triggers: “Help with this page” and text links such as “What does reach mean?” Use visible
labels, not a row of unexplained question-mark icons. One drawer, URL topic state, a topic
list, and related topics. It keeps the page's date, filters, and selected row. A glossary
is a reference inside the drawer; essential limitations stay next to the affected result.

Every topic supplies: **Meaning → How to read it → What to do → Limits**. The full proposed
topic copy is owned by `research/design-explorations/instagram-dashboard/study.js`.
It is the copy source for the study, not a second production owner. On implementation,
move it into one dashboard-owned module and consume it from both page and drawer.

Required topics and their key content:

| Topic | What the reader must leave knowing |
|---|---|
| Read this page | Start with dates and coverage; read the finding; inspect evidence; choose one next action |
| Reach and views | Reach counts different accounts; views can repeat; never sum daily reach into unique monthly reach |
| A typical day | Median is the middle daily value; half the days are at or below it, half at or above it; spikes have less influence |
| Comparison dates | Equal complete windows, same metric and source; no percentage from a zero baseline |
| Follows and unfollows | Net flows are follows minus unfollows; these are counts, not identities or a diagnosis |
| Learn from a post | Choose the objective first, inspect like formats and post age, propose one content test |
| Saves and shares | Distinct actions; neither proves intent to enroll; compare each separately |
| Lifetime totals | Date filter selects publication dates; displayed totals are as last observed, not earned only in the selected range |
| Reels | Watch time is a duration, skip rate is a provider measure; no watch percentage without video duration |
| Story actions | Keep navigation directions separate; link taps are actions, not unique people or registrations |
| Audience | Snapshot of reported follower categories; not everyone is classified, cities are truncated |
| Missing results | Not reported, unsupported, delayed, not captured, and zero are different states |
| Data freshness | Last success, latest attempt, and the date being measured answer different questions |
| Missing Collabs | Other accounts' posts may appear on Instagram but not in this collected list |
| Registration results | This dashboard cannot establish sign-ups; consult the existing club scorecard and its counting rules |

## Action rules, without invented certainty

| Evidence | On-screen conclusion | Next inspection |
|---|---|---|
| Complete equal reach windows | Typical daily reach rose / fell / was unchanged; give both values | Inspect posts in the selected publication period; do not say they caused the change |
| High saves on one observed post | “Most saves among the posts shown” | Open that post and compare its format and age with another |
| Follows and unfollows nearly cancel | State the exact flow and net; no arbitrary alarm threshold | Review follower trend over a longer complete window |
| A Story reports link taps | State taps and last reading | Check the linked destination; use the scorecard for later steps |
| A necessary metric or day is missing | “We can't compare these periods yet” | Show missing dates and data status |
| Latest expected collection is overdue | “These results are out of date” | Read last good data; show maintainer recovery instructions |

No recommendation engine is required. Deterministic, reviewed templates are sufficient.
Every action must have a working destination. Planning, assignment, acknowledgments,
publishing, and experiments with stored outcomes would expand the product and stay out.

## Object / action / state matrix

| Object | Owner | Valid actions | States | Reverse action |
|---|---|---|---|---|
| Date window | Reader | Change, reset, share URL | Valid, clipped by history, no comparison | Back or reset |
| Metric | Instagram + collector | Inspect definition, open table | Reported, zero, absent, provisional, outdated, unsupported | Close help |
| Post | Instagram | Filter, sort, inspect, open original | Reported, incomplete, missing caption, old reading | Back restores context |
| Story | Instagram | Inspect, open original when usable | Live, expired, unobserved, partial capture | Back |
| Audience snapshot | Instagram | Read categories and coverage | Present, partly classified, absent, outdated | Collapse detail |
| Update status | Collector | Inspect, read recovery instructions | OK, partial, missing scope, invalid token, error, overdue | Back |
| Help topic | Dashboard | Open, select related topic, close | Open, closed, topic not found | Escape / Close |
| Session | Existing auth | Sign in, sign out | Signed out, invalid passphrase, limited, signed in | Sign out |

Loading: keep navigation and selected dates, use short “Loading results…” text and
`aria-busy`; no fabricated zeros. Error: preserve last known values only with their old
timestamps and an explicit warning. Empty: explain collection status before implying
an inactive account. No results after filtering: retain filters and provide Clear filters.

## Data work needed before this can be implemented honestly

The current read model is useful but insufficient for every proposed label.

| Need | Current source | Required change |
|---|---|---|
| Daily reach, views, interactions, follows | `account_metric_days`, selected metrics in `data.js` | Carry per-metric day coverage and observation timestamps |
| Reliable follower-change total | `loadDashboard` currently sums observed finite values | Suppress full-period totals when either flow is incomplete; optionally show explicitly partial totals |
| Freshness by section | `sync_runs`, account and audience snapshots | Read `finished_at`, latest success, expected schedule and timestamps per dataset; don't call `started_at` “updated” |
| Equal date scope | `periodWindow` ends at newest available data | Anchor requested dates to calendar/reporting time; show gaps instead of moving the window |
| Honest line chart | `reachChart` removes null points before drawing | Split paths at missing days; distinguish provisional points from gaps |
| Post freshness | `media_metric_snapshots.observed_at` | Retain timestamps per metric; `shapePosts.readDay` alone can describe only the first row encountered |
| Apples-to-apples post comparison | Lifetime snapshots, daily reads for recent posts | Label lifetime and post age now; offer fixed-age comparisons only after matched snapshots exist |
| Stories | Hourly reads and navigation breakdowns | Missing navigation stays missing, never synthesized with `?? 0`; expose capture window and last reading |
| Audience | Latest audience rows, top cities, age and gender | Carry observed timestamp and category-specific coverage; do not imply full population |
| Online hours | `online_followers` | Verify timezone against Business Suite and sufficient complete days before surfacing |
| Thumbnails | Not stored in current `media` schema | Optional later collector/cache work, with permitted media and expiry handling |
| Registration linkage | Existing separate club scorecard | Verify its canonical destination before adding a link; no placeholder URL |

Keep `graph_api` and `business_suite` separate. Profile link taps have a documented
account-specific mismatch and must not become a headline or conversion measure merely
because a field exists. The current two-day revision buffer is an operating convention,
not a guarantee that older numbers never change.

## Verification and decision

Before implementing the selected direction, have a reader who did not build it review
the rendered study. For later operator validation, ask a director and content operator to
find what changed, explain reach versus views, open the post worth inspecting, identify
a missing comparison, and say what they can do about an outdated update. Record errors
and hesitation; do not turn a subjective score into evidence of task success.

Before production, test populated, zero, missing-day, new-history, partial-collection,
expired-access, long-caption, unsupported-metric and empty-filter states. Exercise keyboard
navigation, focus restoration, phone layout, and chart/table equivalence. Plant a missing
day and a false-success timestamp to prove those checks can fail. Compare the shipped
screen to the selected study and obtain a cold rendered review.

Implementation order: data truth first; shared navigation and help; Overview; Posts and
detail; Stories; Audience and Data status; rendered review; existing tests and deployment
checks. Preserve the read-only boundary, access controls, escaping, and no-store headers.

What could change the selected structure: operators consistently need the same one
question on arrival (remember that choice); they only use this while preparing posts
(consider a Posts entry point); or Stories volume stays so low that a separate page adds more navigation than value
(combine Posts and Stories under Content with explicit tabs and their own dates).

## Provenance and limits

- Context: Claude session `becd1789-c739-49f4-9fe3-abaf004e1490`, read in this session.
- Current implementation: `scripts/social-publish/insights-dashboard/src/{data,page,index}.js`,
  collector `worker/src/insights.js`, migrations, and `INSIGHTS.md`, checked at `ba3c7be`.
- Appearance: signed-in live desktop and phone captures on 2026-10-16; real content was
  inspected but is deliberately absent from the tracked study.
- Brand: the owned 630 club guide, checked in this session. No external design borrowed.
- Meta media-insights documentation was requested directly on 2026-10-16 and returned
  HTTP 429. Provider definitions here follow the implemented fields and existing project
  contract; a fresh vendor verification is still needed for detailed watch/skip semantics.
- No operator task test has run. The study cannot prove better decisions or registration
  outcomes. It has no production data connection and cannot save or publish anything.

The [screen-review record](../evidence/screen-reviews/instagram-study-20261016/review.md)
names the independent findings, repairs, and verification limits. The study implements
navigation, sorting, filtering, post detail, and contextual help. Dates are fixed;
sign-in, loading, real Instagram links, and production data mapping are specified only.

## Unified tracking extension — preserve, October 16, 2026

Nino requested one database and dashboard in place of the tracking Sheet. Preserve
 the selected layout, brand, API questions, main navigation, date meanings, access
model and help behavior. Add a Business Suite report in the utility navigation;
account totals and top posts are two views of that report. The reader is the same
club operator, deciding what changed and which content merits inspection.

Three data structures were compared against real cases: a single blended series
would double-count views and misstate unique reach; independent stores would retain
 the current split; source-labeled observations in the existing database preserve both
 meanings. The third is selected. Keep the first option's single entry point through
 the same authenticated dashboard. Reject its metric blending. Keep the second
option's distinct source definitions, but reject its separate storage and Sheet sync.

Affected surfaces: dashboard utility navigation, Business Suite account report,
Business Suite top-post snapshot, and their empty/outdated/help states. The account
report selects native observed ranges rather than inventing unique reach for an
arbitrary filter. The post view retains its bounded top-12 scope, full caption,
publication day, reading time, verified permalink where available, and unverified
ownership. Daily tables are inspectable details with a sideways-scroll cue on phones.
Missing values read “Not reported”; a source delay stays visible beside period totals.
This extension adds no motion and does not imply a measured improvement in operator
 task success.
