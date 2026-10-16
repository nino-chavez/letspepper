import { ACCOUNT, validateReport } from './business-suite-report.mjs'

// Like the API collector, bind JSON rather than interpolating it into SQL text.
// The report can exceed D1's 100 KB SQL limit while fitting its 2 MB value limit.
export function reportStatements(report) {
  validateReport(report)
  return [{sql:`INSERT INTO account_metric_days (account,day,metric,value,source,first_observed_at,last_observed_at)
SELECT ?1, j.value ->> 'day', j.value ->> 'metric', j.value ->> 'value', 'business_suite', j.value ->> 'observed_at', j.value ->> 'observed_at'
FROM json_each(?2) AS j WHERE true
ON CONFLICT (account,day,metric,source) DO UPDATE SET value=excluded.value,last_observed_at=excluded.last_observed_at
WHERE julianday(excluded.last_observed_at) >= julianday(account_metric_days.last_observed_at)`,params:[ACCOUNT,JSON.stringify(report.daily)]},
  {sql:'INSERT INTO business_suite_reports (account,captured_at,through_day,report_json) VALUES (?1,?2,?3,?4) ON CONFLICT (account,captured_at) DO NOTHING',params:[ACCOUNT,report.captured_at,report.through_day,JSON.stringify(report)]}]
}

export async function d1Query({accountId,databaseId,token,sql,params=[]},request=fetch) {
  if(!/^[a-f0-9]{32}$/.test(accountId??'')||!databaseId||!token)throw Error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN using the existing 1Password item')
  const response=await request(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(60000)})
  const body=await response.json()
  if(!response.ok||body.success!==true||!body.result?.length||body.result.some(r=>r.success!==true))throw Error(`D1 query failed (HTTP ${response.status}; codes ${(body.errors??[]).map(e=>e.code).join(',')||'unknown'})`)
  return body.result.flatMap(r=>r.results??[])
}
