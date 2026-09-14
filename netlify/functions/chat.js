const fs   = require('fs');
const path = require('path');

// Time-series files are append-only (oldest → newest) and each entry already
// carries its own precomputed YoY deltas, so we only need recent history here —
// not the full run log — to keep the prompt bounded.
const MAX_HISTORY_ENTRIES = 6;
const HISTORY_KEYS = ['months', 'weeks'];

function loadDashboardData() {
  // Try paths in order — cwd() is /var/task in Netlify Lambda
  const roots = [process.cwd(), process.env.LAMBDA_TASK_ROOT, path.join(__dirname, '../..')].filter(Boolean);
  let dataDir = null;
  for (const root of roots) {
    const candidate = path.join(root, 'data');
    try { if (fs.statSync(candidate).isDirectory()) { dataDir = candidate; break; } } catch (_) {}
  }
  if (!dataDir) return '';

  const files = fs.readdirSync(dataDir)
    .filter(f => f.endsWith('.json'))
    .sort();

  return files.map(file => {
    try {
      const json = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
      for (const key of HISTORY_KEYS) {
        if (Array.isArray(json[key]) && json[key].length > MAX_HISTORY_ENTRIES) {
          json[key] = json[key].slice(-MAX_HISTORY_ENTRIES);
        }
      }
      return `=== ${file.replace('.json', '')} ===\n${JSON.stringify(json)}`;
    } catch (_) { return ''; }
  }).filter(Boolean).join('\n\n');
}

// Cached across warm Lambda invocations
let dashboardData = null;

exports.handler = async function(event) {
  const ORIGIN = 'https://inquired-marketing-dash.netlify.app';
  const headers = {
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let message, pageTitle, history;
  try {
    ({ message, pageTitle, history = [] } = JSON.parse(event.body || '{}'));
  } catch (_) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  if (!message || !message.trim()) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Message required' }) };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  if (dashboardData === null) {
    dashboardData = loadDashboardData();
  }

  const context = pageTitle ? `The user is currently viewing the "${pageTitle}" tab.` : 'The user is on the Dash reporting overview tab.';

  const system = `You are the Dash Assistant — an AI embedded in inquirED's internal marketing reporting dashboard ("Dash").

${context}

Rules:
- Answer only based on the reporting data provided below. Never invent numbers or trends.
- If something isn't in the data, say so clearly rather than guessing.
- Be concise and direct. Use bullet points for lists. Lead with the number/answer, not the setup.
- Only the most recent ${MAX_HISTORY_ENTRIES} periods of each time-series file are included below — if asked about anything older, say that older history isn't loaded into this chat.
- Do not search the internet or reference anything outside this data.

DASHBOARD DATA:
${dashboardData || 'No dashboard data available.'}`;

  const messages = [
    ...history.slice(-10).filter(m => m.role && m.content),
    { role: 'user', content: message.trim() }
  ];

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1024,
        system,
        messages
      })
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Anthropic error:', res.status, err);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Upstream API error' }) };
    }

    const data = await res.json();
    // claude-sonnet-5 thinks by default, so content[0] is usually a `thinking` block, not the
    // reply — index into it and you get a silently empty chat bubble. Find the actual text block.
    const textBlock = Array.isArray(data.content) ? data.content.find(function (b) { return b && b.type === 'text'; }) : null;
    const reply = textBlock?.text || '';
    return { statusCode: 200, headers, body: JSON.stringify({ reply }) };

  } catch (err) {
    console.error('Chat function error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
