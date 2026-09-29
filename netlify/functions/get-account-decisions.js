// Reads the full Airtable "Account Decisions" log and returns it as JSON, oldest first.
// Used by the Account Pulse (MQA) tab to show each stale MQA's latest Demote /
// Recycle / Escalate decision and its full history.
//
// Env vars (Netlify → Site configuration → Environment variables):
//   AIRTABLE_API_KEY                     (secret) same token State Signal's decisions use; it must
//                                         have read/write access to base apprP4OjHNI918JlX too
//   AIRTABLE_ACCOUNT_DECISIONS_BASE_ID   optional, defaults to apprP4OjHNI918JlX
//   AIRTABLE_ACCOUNT_DECISIONS_TABLE     optional, defaults to tblksZcY1lzbWKh8C (the decisions table)

const AIRTABLE_TOKEN = process.env.AIRTABLE_API_KEY;
// Own base (not State Signal's). IDs aren't secrets; env vars can override them.
const AIRTABLE_BASE_ID = process.env.AIRTABLE_ACCOUNT_DECISIONS_BASE_ID || 'apprP4OjHNI918JlX';
const TABLE = process.env.AIRTABLE_ACCOUNT_DECISIONS_TABLE || 'tblksZcY1lzbWKh8C';

const ORIGIN = 'https://inquired-marketing-dash.netlify.app';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}

exports.handler = async function (event) {
  const headers = corsHeaders();

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    console.error('Airtable not configured — missing AIRTABLE_API_KEY env var');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  try {
    let records = [];
    let offset;
    do {
      const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE)}`);
      url.searchParams.set('pageSize', '100');
      if (offset) url.searchParams.set('offset', offset);

      const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      if (!res.ok) {
        const err = await res.text();
        console.error('Airtable list error:', res.status, err);
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Upstream Airtable error', status: res.status }) };
      }
      const data = await res.json();
      records = records.concat(data.records || []);
      offset = data.offset;
    } while (offset);

    const entries = records
      .map((r) => ({
        companyId: r.fields.CompanyId || '',
        companyName: r.fields.CompanyName || '',
        decision: r.fields.Decision || '',
        note: r.fields.Note || '',
        decidedBy: r.fields.DecidedBy || '',
        decidedAt: r.fields.DecidedAt || '',
        daysMqa: r.fields.DaysMqaAtDecision == null ? null : r.fields.DaysMqaAtDecision
      }))
      .filter((e) => e.companyId && e.decidedAt)
      .sort((a, b) => a.decidedAt.localeCompare(b.decidedAt));

    return { statusCode: 200, headers, body: JSON.stringify({ entries }) };
  } catch (err) {
    console.error('get-account-decisions error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
