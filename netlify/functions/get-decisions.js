// Reads every row from the Airtable "Decisions" table and returns them as JSON.
// Used by the State Signal (MQA) tab to merge Actioned / Not Interested triage
// decisions (+ notes) onto the top_states / watch_states rows on page load.
//
// Env vars (set in Netlify → Site configuration → Environment variables):
//   AIRTABLE_API_KEY          (secret) Airtable Personal Access Token — NOT set by this
//                              deploy; Kelsey needs to add it herself (see README note below).
//   AIRTABLE_DECISIONS_BASE_ID  Airtable base ID, e.g. "appzko62XB8YDvyqU" — already set.
//   AIRTABLE_DECISIONS_TABLE_NAME  Optional, defaults to "Decisions".

const AIRTABLE_TOKEN = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_DECISIONS_BASE_ID;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_DECISIONS_TABLE_NAME || 'Decisions';

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
    console.error('Airtable not configured — missing AIRTABLE_API_KEY and/or AIRTABLE_DECISIONS_BASE_ID env var');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  try {
    let records = [];
    let offset;
    do {
      const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`);
      url.searchParams.set('pageSize', '100');
      if (offset) url.searchParams.set('offset', offset);

      const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      if (!res.ok) {
        const err = await res.text();
        console.error('Airtable list error:', res.status, err);
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Upstream Airtable error' }) };
      }
      const data = await res.json();
      records = records.concat(data.records || []);
      offset = data.offset;
    } while (offset);

    const decisions = records
      .map((r) => ({
        state: r.fields.State || '',
        product: r.fields.Product || '',
        decision: r.fields.Decision || '',
        notes: r.fields.Notes || '',
        decidedAt: r.fields.DecidedAt || '',
        decidedBy: r.fields.DecidedBy || ''
      }))
      .filter((d) => d.state && d.product);

    return { statusCode: 200, headers, body: JSON.stringify({ decisions }) };
  } catch (err) {
    console.error('get-decisions error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
