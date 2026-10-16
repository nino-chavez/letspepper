/** Business Suite is a separate observation source in the same private database. */
export const BUSINESS_SUITE_QUERY = `SELECT captured_at, through_day, report_json FROM business_suite_reports WHERE account = ?1 ORDER BY captured_at DESC LIMIT 1`
export async function loadBusinessSuite(db) {
  let row
  try { row=await db.prepare(BUSINESS_SUITE_QUERY).bind('630').first() } catch(error) {
    // The scheduler applies migrations independently of dashboard deployment.
    if (/no such table: business_suite_reports/.test(error.message)) return null
    throw error
  }
  return row ? JSON.parse(row.report_json) : null
}
