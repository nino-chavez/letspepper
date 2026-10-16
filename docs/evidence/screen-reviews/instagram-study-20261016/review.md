# Instagram dashboard study: screen review

The first review favored **A, Weekly brief**. Nino subsequently selected a blend:
B’s operator questions with A/C’s side navigation. That human decision is recorded
in the experience brief and supersedes the first recommendation. No operator task
test has established that the selected blend improves decisions.

## What was reviewed

The parent inspected the signed-in current dashboard, then the rendered concepts
and their phone layouts. The private baseline remains outside version control.
Every image in this directory shows invented data, with a visible mock-data notice.
The source is `research/design-explorations/instagram-dashboard/`.

An independent reviewer received 14 neutral-named captures, the intended reader and
job, and no specification or implementation source. It compared the three homes,
complete/missing/outdated/empty states, and the recommended pages and help drawer.
It preferred A for a first visit, B for a reader with a question, and C for an
experienced content operator. The parent then checked the reported defects against
the actual frames and behavior; the report was not treated as proof by itself.

Local dispatch receipt: `84787859-63e6-4ce7-94f5-3339d0536bbb`, completed
2026-10-16. The launch receipt selected a balanced route; the runtime did not expose
an observed model or effort. No claim about the model actually used is made here.

## Findings and dispositions

| Finding | Parent assessment and change |
|---|---|
| Phone hides Data status | Confirmed. Added Data status beside page help on every phone page. |
| Strong content action competes with missing-data notice | Confirmed as a hierarchy problem. Missing state now leads to Check missing results; inspecting unrelated post results stays secondary. |
| Missing point has no chart label | Confirmed. The gap now says Oct 8: not reported. The line still breaks. |
| “Are followers staying?” implies retention | Confirmed. Replaced with “How did follower numbers change?” throughout. |
| “Recorded” may imply complete coverage | Narrowed. An update can succeed while coverage is limited. Changed status to Update succeeded and retained the relevant scope notes. |
| Lifetime ranking can read as a performance verdict | Narrowed. Sorting remains useful, but the table now names Lifetime, shows age at the last reading, and explains scope above the list. |
| Story actions look like list totals | Confirmed. The heading names the dated Story; nearby copy explicitly limits actions to it. |
| Concept B delays the next action | Accepted as a structural cost, not a broken control. Its question buttons work, but the reader must first choose a question. This supports A as the recommended home. |

The parent inspected the corrected home, missing state, Posts, post detail, Stories,
Audience, Data status and help, including phone frames. Final copy also removes
implementation instructions from operator-facing explanations and gives outdated
post rows the correct age at their older reading.

## Verification

`review.mjs` ran successfully against the local study on 2026-10-16. It uses the
repository's Playwright dependency and writes `captures.json` with each capture's
state and viewport. It is an explicit local review command, not a production CI gate.

- 24 captures: all three concepts in four data states; the recommended pages, post
  detail and help; and the recommended phone pages and help.
- Desktop viewport: 1365 × 900. Phone viewport: 390 × 844. Chromium headless,
  device scale factor 1. These are browser captures, not physical-device acceptance.
- The overflow check first detected an intentionally inserted 3000-pixel element.
  After removing it, all captured pages fit the document's viewport width.
- A missing reach day breaks the chart into two paths and suppresses the percentage.
  Missing unfollows suppress a complete-period net total.
- Compare posts by saves opens the right sorting. A post opens and closes. Caption
  search can reach an empty result and Clear filters restores the list.
- Page help opens the relevant topic. Escape closes it and restores trigger focus.
  The phone drawer fits the viewport. No JavaScript page errors were observed.
- JavaScript syntax check passed.

## Limits and next decision

These checks do not prove live data mapping, all accessibility behavior, provider
metric definitions, sign-in, loading, physical-device interaction, or operator task
success. The prototype uses fixed dates and invented posts. It cannot fetch, save,
publish, or schedule anything. The study is not the deployed dashboard.

The home structure is selected. The experience brief specifies the data corrections needed first and the tasks a club director and a
content operator should attempt. A production release needs new evidence against
real data, with private captures kept private.

## Selected blend, 2026-10-16

Nino selected question-led content with A/C's side navigation. The study now defaults
to that blend, retains the three source concepts, and applies question headings and
purpose statements across the detail pages. This is a selected design direction;
production behavior and operator effectiveness remain unproven.

The parent opened the rendered question answers, detail pages, missing/empty/outdated
states and phone views. A second cold reviewer inspected 13 neutral-named frames,
without source or specification. Completed dispatch:
`312ef69a-c796-4d09-83ae-301a59cfdf1c`. Observed model and effort were unavailable.
An earlier dispatch returned only a missing-path request and is not counted as review.
Branch references were unchanged by both read-only dispatches.

The parent checked each substantive finding against the visible copy rather than
relying on the reviewer's frame numbers:

- Outdated reach still offered a current-sounding post inspection. The action now
  says Inspect dated post results and names the older Oct 13 reading.
- Posting-time guidance named a limitation without an owner action. It now tells
  the operator to ask the dashboard maintainer to verify timezone and coverage.
- Reading date and reporting day needed a clearer distinction. Data status now
  explains that an update reads earlier reporting days.
- Phone study controls competed with the operator screen. They now sit behind
  Study controls; the synthetic-data disclosure stays visible.

The parent also corrected the empty state so it cannot claim a last reading, and
made page help open the currently selected question's topic. The corrected empty,
outdated and phone frames were inspected after these changes.

The local review runner passed with 43 captures, including the 24 original-concept
views and 19 blend views. Added behavior checks cover the default blend, question
selection and reload, question-specific table sorting, clearing hidden post filters
when opening all posts, incomplete follower totals, empty freshness, phone question
selection and focus, phone study controls, and contextual help. The overflow canary
still detected deliberate overflow before the real pages were checked. No page
JavaScript errors were observed. These are browser tests with invented data, not
physical-device acceptance or live collection verification.

## Production implementation review, 16 October 2026

The selected blend is implemented in the separate insights Worker. The parent inspected
the actual workerd-rendered desktop and phone captures before a cold review. All committed
frames and test records use invented data. Real-data verification stays in private local
artifacts.

The browser walk uses the production bundle, the local Cloudflare runtime, and disposable
D1 tables created from the actual migrations. It passed sign-in rejection/acceptance,
calendar and publication controls, navigation and reload persistence, sorting/search,
post details and Instagram-link validation, hostile captions, contextual help topics,
Escape/focus return, missing chart values, failed collection, empty data, and database
failure. The horizontal-overflow detector first failed on a deliberately inserted wide
visible element; every real desktop/phone frame then passed. Twenty-one states were
captured. The fixture clock is frozen only in the test bundle.

An independent read-only cold reviewer inspected fifteen full-screen captures without
source or the design brief (dispatch b63a1293-3581-4b5a-a20d-d40e834289cd). Execution
completed; the requested route was recorded, but runtime model/effort were not exposed.
The parent checked each finding against the visible frame and running behavior:

- Follower bars lacked a numeric scale. Added scale labels and per-day values in the
  seven-day view; the exact-value table remains available.
- Los Angeles reporting dates and Central timestamps required extra interpretation.
  Publication filters now state that boundary beside the dates; timestamps name Central.
- Load failure offered only reload. Added offline guidance explaining the read failure
  and what the maintainer should inspect. A Data status link would depend on the same
  unavailable database, so it is not offered as a working recovery.
- A full-page capture made the phone modal appear to end above background content. This
  was a capture artifact: the native dialog covers the viewport. Modal captures now use
  viewport size; the parent inspected the result and tested Escape/focus restoration.
- Code-like post titles were deliberate hostile-caption fixtures. They remain literal
  text to prove escaping; the dashboard must preserve source captions rather than alter
  real text to hide the fixture.

The final browser walk passed again after those changes. The six `production-*.png`
frames beside this receipt show the selected result, including missing and error states.
The page's source contains no study selector or synthetic fixture content.

The read-model unit tests, scheduler tests, publisher tests, website reader check,
standings/predictions checks, mascot asset check, and Worker package dry run passed.
A read-only call of the new loader against live D1 also succeeded. The dashboard's queries
remain exclusively SELECT; collector code, schema, schedules, publisher queues, and auth
semantics are unchanged. No migration or production data write is part of this release.
Worker deployment and the final authenticated live walk remain separate release evidence.
