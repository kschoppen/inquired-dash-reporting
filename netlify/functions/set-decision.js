// Upserts a single {state, product} triage decision into the Airtable "Decisions"
// table. Called from the State Signal (MQA) tab's Actioned / Not Interested / Clear
// controls and its notes field.
//
// Body: { state: "CA", product: "inkwell", decision: "Actioned" | "Not Interested" | "",
//          notes: "free text" }
//
// Env vars — see get-decisions.js for the full list. This function needs the same
// AIRTABLE_API_KEY (secret, not set by this deploy) and AIRTABLE_DECISIONS_BASE_ID.

const AIRTABLE_TOKEN = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_DECISIONS_BASE_ID;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_DECISIONS_TABLE_NAME || 'Decisions';

const ORIGIN = 'https://inquired-marketing-dash.netlify.app';
const VALID_DECISIONS = new Set(['Actioned', 'Not Interested', '']);

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}

function escapeFormulaValue(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

exports.handler = async function (event) {
  const headers = corsHeaders();

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    console.error('Airtable not configured — missing AIRTABLE_API_KEY and/or AIRTABLE_DECISIONS_BASE_ID env var');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  let state, product, decision, notes;
  try {
    ({ state, product, decision = '', notes = '' } = JSON.parse(event.body || '{}'));
  } catch (_) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  state = (state || '').toString().trim().toUpperCase();
  product = (product || '').toString().trim().toLowerCase();
  decision = (decision || '').toString().trim();
  notes = (notes || '').toString();

  if (!state || !product) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'state and product are required' }) };
  }
  if (!VALID_DECISIONS.has(decision)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'decision must be "Actioned", "Not Interested", or blank (to clear)' }) };
  }
  if (notes.length > 5000) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'notes too long' }) };
  }

  const key = `${state}-${product}`;
  const base = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`;
  const authHeaders = { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' };

  try {
    // Find the existing row for this Key, if any.
    const findUrl = new URL(base);
    findUrl.searchParams.set('filterByFormula', `{Key}="${escapeFormulaValue(key)}"`);
    findUrl.searchParams.set('maxRecords', '1');
    const findRes = await fetch(findUrl, { headers: authHeaders });
    if (!findRes.ok) {
      const err = await findRes.text();
      console.error('Airtable find error:', findRes.status, err);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Upstream Airtable error' }) };
    }
    const findData = await findRes.json();
    const existing = (findData.records || [])[0];

    const fields = {
      Key: key,
      State: state,
      Product: product,
      // Airtable single-select fields reject "" — omit/null clears the selection.
      Decision: decision || null,
      Notes: notes
    };
    if (decision) {
      fields.DecidedAt = new Date().toISOString().slice(0, 10);
      fields.DecidedBy = 'dashboard';
    } else {
      // Clearing a decision — leave DecidedAt/DecidedBy as whatever they last were
      // rather than erasing the history of who last touched this row.
    }

    let saved;
    if (existing) {
      const updateRes = await fetch(`${base}/${existing.id}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ fields })
      });
      if (!updateRes.ok) {
        const err = await updateRes.text();
        console.error('Airtable update error:', updateRes.status, err);
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Upstream Airtable error' }) };
      }
      saved = await updateRes.json();
    } else {
      const createRes = await fetch(base, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ fields })
      });
      if (!createRes.ok) {
        const err = await createRes.text();
        console.error('Airtable create error:', createRes.status, err);
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Upstream Airtable error' }) };
      }
      saved = await createRes.json();
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        state,
        product,
        decision: saved.fields.Decision || '',
        notes: saved.fields.Notes || '',
        decidedAt: saved.fields.DecidedAt || '',
        decidedBy: saved.fields.DecidedBy || ''
      })
    };
  } catch (err) {
    console.error('set-decision error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
