// Appends one Demote / Recycle / Escalate / Cleared decision to the Airtable
// "Account Decisions" log. Append-only: every click is a new row and nothing is
// overwritten, so the log is the account's full decision history. Called from the
// Stale MQAs section of the Account Pulse (MQA) tab. HubSpot is never touched.
//
// Body: { companyId: "8976097637", companyName: "...", decision: "Demote" | "Recycle" |
//         "Escalate" | "Cleared", note: "free text", decidedBy: "Kelsey", daysMqa: 316 }
//
// Env vars: see get-account-decisions.js.

const AIRTABLE_TOKEN = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_DECISIONS_BASE_ID;
const TABLE = process.env.AIRTABLE_ACCOUNT_DECISIONS_TABLE_NAME || 'Account Decisions';

const ORIGIN = 'https://inquired-marketing-dash.netlify.app';
const VALID_DECISIONS = new Set(['Demote', 'Recycle', 'Escalate', 'Cleared']);

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}

exports.handler = async function (event) {
  const headers = corsHeaders();

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    console.error('Airtable not configured — missing AIRTABLE_API_KEY and/or AIRTABLE_DECISIONS_BASE_ID env var');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (_) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const companyId = String(body.companyId || '').trim();
  const companyName = String(body.companyName || '').trim().slice(0, 200);
  const decision = String(body.decision || '').trim();
  const note = String(body.note || '');
  const decidedBy = String(body.decidedBy || '').trim().slice(0, 80);
  const daysMqa = Number.isFinite(Number(body.daysMqa)) ? Math.round(Number(body.daysMqa)) : null;

  if (!/^\d{1,20}$/.test(companyId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'companyId must be a HubSpot company ID' }) };
  }
  if (!VALID_DECISIONS.has(decision)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'decision must be Demote, Recycle, Escalate or Cleared' }) };
  }
  if (!decidedBy) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'decidedBy (your name) is required' }) };
  }
  if (note.length > 5000) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'note too long' }) };
  }

  const decidedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const fields = {
    Entry: `${companyId}-${decidedAt}`,
    CompanyId: companyId,
    CompanyName: companyName,
    Decision: decision,
    Note: note,
    DecidedBy: decidedBy,
    DecidedAt: decidedAt
  };
  if (daysMqa != null) fields.DaysMqaAtDecision = daysMqa;

  try {
    const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [{ fields }], typecast: true })
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('Airtable create error:', res.status, err);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Upstream Airtable error', status: res.status }) };
    }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ companyId, companyName, decision, note, decidedBy, decidedAt, daysMqa })
    };
  } catch (err) {
    console.error('set-account-decision error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
