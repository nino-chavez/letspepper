/** Runs inside the page: placement belongs to Filter, not Posts and stories. */
export function toggleContentFilter() {
  const controls = [...document.querySelectorAll('[role=combobox]')].filter(e =>
    /^Filter(?:: \d+ selected)?$/.test(e.innerText.replaceAll('\u200b', '').trim()))
  if (controls.length !== 1) throw Error('Content Filter control missing or ambiguous')
  controls[0].click()
  return true
}
