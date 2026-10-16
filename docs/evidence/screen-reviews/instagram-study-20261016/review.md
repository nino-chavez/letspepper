# Instagram dashboard study: screen review

The recommended home is **A, Weekly brief**. It gives a first-time club operator a
finding, the evidence behind it, and one useful next inspection. This is a proposed
direction. Nino has not selected it, and no operator task test has established that
it improves decisions.

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

Choose the home structure before production implementation. The experience brief
specifies the data corrections needed first and the tasks a club director and a
content operator should attempt. A production release needs new evidence against
real data, with private captures kept private.
