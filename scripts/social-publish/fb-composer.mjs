/**
 * Drive the logged-in browse-tool Chrome through Facebook's composer with real
 * input events — the sanctioned fallback for the surfaces the Pages API refuses
 * (album creation, and anything needing a Page @mention).
 *
 *   browse-start --profile-name meta-setup      # NOT --headless, see below
 *   FB_PAGE_MATCH=facebook.com \
 *     node scripts/social-publish/fb-composer.mjs <step> [args...]
 *
 * Always set FB_PAGE_MATCH when the profile has other tabs open — without it the
 * target page is whichever reports visible first, which is not stable across steps.
 *
 * Steps: switch | goto <url> | click <text> [partial] [nth] | clickxy <x> <y> |
 *        type <label> <text> | typeidx <n> <text> | typexy <x> <y> <text> |
 *        append <text> [delayMs] | clear <x> <y> | keys <k1,k2> | esc |
 *        upload <buttonText> <path1,path2,...> | uploadxy <x> <y> <path1,...> |
 *        buttons | shot <path> | watch <sec>
 *
 * Hard-won details, all of them load-bearing:
 * - Run HEADED. Headless clicks on Facebook's menus silently no-op; the album
 *   Post button worked but every menu item did not. `watch` exists because the
 *   composer stays open after a successful post in headless and the only honest
 *   completion signal is the Graph API.
 * - Click via page.mouse at the element's box centre. Synthetic .click() from
 *   browse-eval does nothing — React never sees it.
 * - Prefer the topmost [role=dialog] when one is open, but fall back to the
 *   document: Facebook leaves dismissed flyouts mounted as [role=dialog].
 * - Menu items are [role=menuitem], not buttons. They must be in the selector.
 * - Text fields are Lexical editors with no aria-label or placeholder to match
 *   on — that is why typexy/typeidx exist. Meta+A does not select in them
 *   either; `clear` selects via DOM Range and deletes with a real key.
 * - File inputs on the page are inert until the picker is opened, so `upload`
 *   goes through waitForFileChooser.
 *
 * KNOWN LIMIT — tagging an UNCONNECTED Page needs a human at the keyboard.
 * "@Players Sport" opens no listbox at all, and the "Tag people" panel answers
 * "No results" for any Page you are not already connected to.
 *
 * A CONNECTED Page can be driven from here — corrected 2026-08-02. The earlier
 * note claimed the option labels were unreadable; they are not. Typing the
 * mention into the personal-profile composer with keyboard.type({delay:130}),
 * then reading [role=option] inside the visible [role=listbox], returned
 * "Flickday Media  Page" cleanly, and clicking its box centre inserted a real
 * mention token. Two rules make it work: never re-click the editor after typing
 * the "@" (that dismisses the typeahead — use keyboard.type only), and wait
 * ~2.5s before reading, because the listbox mounts empty.
 *
 * Verify the insertion before posting: a resolved mention is a
 * span[spellcheck="false"] inside the [role=textbox]; literal un-resolved text
 * is a plain span[data-lexical-text]. Posting on that check failing puts an
 * unlinked "@Name" on a public timeline.
 *
 * Video works. Both Big Dig reels were posted to the personal timeline this way
 * on 2026-08-02 (uploadxy → wait for a <video> in the dialog → Post).
 */
import puppeteer from '/Users/nino/Workspace/dev/tools/browse-tool/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// browse-tool keys its state file by port (one browser per port) — an unsuffixed
// browse-tool-state.json has not existed since the port-ownership change, so
// reading it threw ENOENT before a single step ran. Honour BROWSE_PORT the way
// every browse-tool bin does, defaulting to 9222.
const port = process.env.BROWSE_PORT || '9222'
const statePath = join(tmpdir(), `browse-tool-state-${port}.json`)
const state = JSON.parse(readFileSync(statePath, 'utf8'))
const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${state.port}`, defaultViewport: null })
const pages = await browser.pages()
// "First visible page" is only deterministic in a single-window profile. A restored
// session with several windows flips which page reports visible between invocations,
// so consecutive steps can silently land on different tabs — a composer opened in one
// step is simply absent in the next. Pin the target with FB_PAGE_MATCH (a URL
// substring) whenever the profile has more than the Facebook tab open.
const match = process.env.FB_PAGE_MATCH
let page = null
if (match) {
  for (const p of pages) { if (p.url().includes(match)) { page = p; break } }
  if (!page) throw new Error(`FB_PAGE_MATCH="${match}" matched no open tab. Open it first (browse-nav) — refusing to act on an arbitrary page.`)
  await page.bringToFront()
} else {
  page = pages[pages.length - 1]
  for (const p of pages) {
    try { if ((await p.evaluate(() => document.visibilityState)) === 'visible') { page = p; break } } catch {}
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Find a clickable by exact/partial visible text or aria-label, then click it with
// a real mouse event at its center (React ignores synthetic .click() here).
async function clickByText(text, { role = null, exact = true, nth = 0 } = {}) {
  const handle = await page.evaluateHandle((text, role, exact, nth) => {
    const sel = role ? `[role="${role}"]` : '[role="button"],[role="link"],[role="menuitem"],a,button'
    // A modal owns input while it's open — search it first, or we click the page behind it.
    const dialogs = [...document.querySelectorAll('[role=dialog]')].filter((d) => d.offsetParent)
    const match = (scope) => [...scope.querySelectorAll(sel)].filter((e) => {
      if (!e.offsetParent && e.tagName !== 'BODY') return false
      const t = (e.getAttribute('aria-label') || e.innerText || '').trim()
      return exact ? t === text : t.includes(text)
    })
    // Modal first (it owns input), but fall back to the page — Facebook leaves
    // dismissed flyouts mounted as [role=dialog].
    let hits = dialogs.length ? match(dialogs[dialogs.length - 1]) : []
    if (!hits.length) hits = match(document)
    return hits[nth] || null
  }, text, role, exact, nth)
  const el = handle.asElement()
  if (!el) throw new Error(`no clickable "${text}"`)
  await el.scrollIntoView().catch(() => {})
  await sleep(300)
  const box = await el.boundingBox()
  if (!box) throw new Error(`"${text}" has no box`)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  return true
}

async function report(label) {
  await sleep(2500)
  const info = await page.evaluate(() => ({
    url: location.href,
    dialogs: [...document.querySelectorAll('[role=dialog]')].map((d) => d.innerText.slice(0, 400)),
    text: document.body.innerText.slice(0, 500),
  }))
  console.log(`\n### ${label}\nurl: ${info.url}`)
  if (info.dialogs.length) console.log(`dialog:\n${info.dialogs.join('\n---\n')}`)
  else console.log(`page:\n${info.text}`)
}

const step = process.argv[2]
const rest = process.argv.slice(3)

try {
  if (step === 'switch') {
    await clickByText('Switch', { role: 'button' })
    await report('after switch')
  } else if (step === 'goto') {
    await page.goto(rest[0], { waitUntil: 'networkidle2', timeout: 60000 })
    await report('goto')
  } else if (step === 'click') {
    await clickByText(rest[0], { exact: rest[1] !== 'partial', nth: Number(rest[2] || 0) })
    await report(`click ${rest[0]}`)
  } else if (step === 'typeidx') {
    // rest[0] = index into the visible input/textarea/contenteditable list, rest[1] = text.
    // Facebook renders floating labels as sibling nodes, so many fields carry no
    // aria-label or placeholder to match on.
    const el = await page.evaluateHandle((i) => {
      return [...document.querySelectorAll('input:not([type=file]),textarea,[contenteditable=true]')]
        .filter((e) => e.offsetParent)[Number(i)] || null
    }, rest[0])
    const node = el.asElement()
    if (!node) throw new Error(`no field at index ${rest[0]}`)
    const box = await node.boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await sleep(400)
    await page.keyboard.type(rest[1], { delay: 25 })
    await report(`typed field #${rest[0]}`)
  } else if (step === 'typexy') {
    // rest[0],rest[1] = coords to focus, rest[2] = text. For Lexical editors that
    // carry no aria-label to match on.
    await page.mouse.click(Number(rest[0]), Number(rest[1]))
    await sleep(600)
    await page.keyboard.type(rest[2], { delay: 30 })
    await report(`typed at ${rest[0]},${rest[1]}`)
  } else if (step === 'append') {
    // Type at the current focus without re-clicking — re-clicking dismisses the
    // @mention typeahead. rest[1] = per-char delay in ms.
    await page.keyboard.type(rest[0], { delay: Number(rest[1] || 120) })
    await sleep(1500)
    const suggestions = await page.evaluate(() => {
      const lb = [...document.querySelectorAll('[role=listbox],[role=menu]')].filter((e) => e.offsetParent)
      return lb.flatMap((l) => [...l.querySelectorAll('[role=option],[role=menuitem]')].map((o, i) => `${i}: ${o.innerText.replace(/\s+/g, ' ').slice(0, 60)}`))
    })
    console.log(suggestions.length ? `typeahead:\n${suggestions.join('\n')}` : 'typeahead: (none)')
  } else if (step === 'clear') {
    // Lexical ignores Meta+A from CDP; select via the DOM, then delete with a real key.
    await page.mouse.click(Number(rest[0]), Number(rest[1]))
    await sleep(500)
    await page.evaluate(() => {
      const ed = document.activeElement?.closest('[contenteditable=true]') || document.activeElement
      if (!ed) return
      const range = document.createRange()
      range.selectNodeContents(ed)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
    })
    await sleep(300)
    await page.keyboard.press('Backspace')
    await sleep(800)
    const left = await page.evaluate(() => {
      const eds = [...document.querySelectorAll('[contenteditable=true]')].filter((e) => e.offsetParent)
      return eds.map((e) => (e.innerText || '').trim().slice(0, 80))
    })
    console.log('editors now:', JSON.stringify(left))
  } else if (step === 'keys') {
    for (const k of rest[0].split(',')) await page.keyboard.press(k.trim())
    await report(`pressed ${rest[0]}`)
  } else if (step === 'clickxy') {
    await page.mouse.move(Number(rest[0]), Number(rest[1]))
    await sleep(200)
    await page.mouse.click(Number(rest[0]), Number(rest[1]))
    await report(`click ${rest[0]},${rest[1]}`)
  } else if (step === 'watch') {
    // Poll until the URL leaves the composer, or the timeout runs out.
    const deadline = Date.now() + Number(rest[0] || 300) * 1000
    let last = ''
    while (Date.now() < deadline) {
      const s = await page.evaluate(() => ({ url: location.href, blobs: document.querySelectorAll('img[src^="blob:"]').length }))
      const line = `${s.url} blobs=${s.blobs}`
      if (line !== last) { console.log(new Date().toISOString().slice(11, 19), line); last = line }
      if (!s.url.includes('/media/set/create')) break
      await sleep(5000)
    }
    await report('watch end')
  } else if (step === 'esc') {
    await page.keyboard.press('Escape')
    await report('after escape')
  } else if (step === 'shot') {
    const out = rest[0] || '/tmp/fb.png'
    await page.screenshot({ path: out })
    console.log(out)
  } else if (step === 'buttons') {
    const list = await page.evaluate(() => {
      return [...document.querySelectorAll('[role=button],[role=link],[role=menuitem],a,button,input,[contenteditable=true]')]
        .filter((e) => { const r = e.getBoundingClientRect(); return e.offsetParent && r.x > -1000 && r.width > 0 })
        .map((e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)} [${e.getAttribute('role') || e.tagName}] aria="${e.getAttribute('aria-label') || ''}" txt="${(e.innerText || '').trim().slice(0, 40)}"` })
        .slice(0, 80)
    })
    console.log(list.join('\n'))
  } else if (step === 'upload') {
    // rest[0] = button text that opens the picker, rest[1] = comma-separated paths.
    // The page's bare input[type=file] is inert until the picker is opened, so go
    // through the real chooser.
    const [chooser] = await Promise.all([
      page.waitForFileChooser({ timeout: 15000 }),
      clickByText(rest[0], { exact: false }),
    ])
    await chooser.accept(rest[1].split(','))
    await report('after upload')
  } else if (step === 'uploadxy') {
    // rest[0],rest[1] = coords of the picker control, rest[2] = comma-separated paths.
    // `upload` matches by label, but the feed and the open Create-post dialog BOTH
    // carry an aria-label="Photo/video" button; clickByText resolves the feed one
    // and clicking it dismisses the modal. Coordinates are the only unambiguous
    // handle, same reason typexy/clickxy exist.
    const [chooser] = await Promise.all([
      page.waitForFileChooser({ timeout: 15000 }),
      page.mouse.click(Number(rest[0]), Number(rest[1])),
    ])
    await chooser.accept(rest[2].split(','))
    await report('after uploadxy')
  } else if (step === 'type') {
    // rest[0] = aria-label or placeholder of the field, rest[1] = text
    const el = await page.evaluateHandle((label) => {
      const find = (scope) => [...scope.querySelectorAll('input,textarea,[contenteditable=true]')]
        .find((e) => e.offsetParent && ((e.getAttribute('aria-label') || '') + (e.getAttribute('placeholder') || '')).includes(label))
      const d = [...document.querySelectorAll('[role=dialog]')].filter((x) => x.offsetParent).pop()
      return (d && find(d)) || find(document) || null
    }, rest[0])
    const node = el.asElement()
    if (!node) throw new Error(`no field matching "${rest[0]}"`)
    const box = await node.boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await sleep(400)
    await page.keyboard.type(rest[1], { delay: 25 })
    await report(`typed into ${rest[0]}`)
  }
} catch (e) {
  console.error('ERROR:', e.message)
  await report('state at error')
  process.exitCode = 1
}
browser.disconnect()
