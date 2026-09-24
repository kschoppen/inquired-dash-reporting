// Teacher Nurture (Mailchimp) live data for teacher-nurture.html.
//
// GET  /api/teacher-nurture              -> phase counts (saved segments) + flow email stats
// POST /api/teacher-nurture?action=setup -> creates any missing [DYNAMIC] phase segments (idempotent)
//
// Env var (Netlify > Site configuration > Environment variables), set by Kelsey:
//   MAILCHIMP_API_KEY   Mailchimp Marketing API key, e.g. "abc123...-us14". The datacenter
//                       is read from the key suffix. Never logged or returned.
// The site is password protected, so these endpoints are only reachable behind that gate.

const AUDIENCE_ID = "20beb95bf5";

// Audience merge tags (see Mailchimp > Audience fields and merge tags)
const F = { segment: "MMERGE3", phase: "MMERGE45", substate: "MMERGE48", active: "MMERGE26" };

function eligible() {
  // Medium / Large / Enterprise districts only: Segment is set and is none of the other values.
  return [
    { condition_type: "SelectMerge", field: F.segment, op: "blank_not" },
    { condition_type: "SelectMerge", field: F.segment, op: "not", value: "Single Site" },
    { condition_type: "SelectMerge", field: F.segment, op: "not", value: "Small District" },
    { condition_type: "SelectMerge", field: F.segment, op: "not", value: "Other" },
  ];
}
const sel = (field, op, value) => (value == null ? { condition_type: "SelectMerge", field, op } : { condition_type: "SelectMerge", field, op, value });

function segmentDefs() {
  const P = "[DYNAMIC] IJ Teacher Mktg _";
  return [
    { key: "eligible", name: `${P}Eligible _F26`, conditions: eligible() },
    { key: "awareness", name: `${P}Phase Awareness _F26`, conditions: [...eligible(), sel(F.phase, "is", "Awareness")] },
    { key: "discovery", name: `${P}Phase Discovery _F26`, conditions: [...eligible(), sel(F.phase, "is", "Discovery")] },
    { key: "adopt", name: `${P}Phase Activation Adopt _F26`, conditions: [...eligible(), sel(F.phase, "is", "Activation"), sel(F.substate, "not", "Sustained")] },
    { key: "sustained", name: `${P}Phase Activation Sustained _F26`, conditions: [...eligible(), sel(F.phase, "is", "Activation"), sel(F.substate, "is", "Sustained")] },
    { key: "holding", name: `${P}Phase Holding _F26`, conditions: [...eligible(), sel(F.phase, "is", "Holding")] },
    { key: "active_users", name: `${P}Active User _F26`, conditions: [...eligible(), sel(F.active, "is", "TRUE")] },
  ];
}

const CODE_RE = /^(T\d+[ab]?(?:-K2|-3-5)?|H\d)\s*[:_]/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

export default async (req) => {
  const key = Netlify.env.get("MAILCHIMP_API_KEY") || Netlify.env.get("MAILCHIMP_KEY") || Netlify.env.get("MC_API_KEY");
  if (!key || !key.includes("-")) return json({ ok: false, error: "MAILCHIMP_API_KEY is not set on this Netlify site (or has no -usXX datacenter suffix)." }, 500);
  const dc = key.split("-").pop();
  const base = `https://${dc}.api.mailchimp.com/3.0`;
  const auth = "Basic " + btoa("dash:" + key);
  const mc = async (path, init = {}) => {
    const r = await fetch(base + path, { ...init, headers: { Authorization: auth, "Content-Type": "application/json", ...(init.headers || {}) } });
    const t = await r.text();
    let b = null;
    try { b = JSON.parse(t); } catch (_) { b = { raw: t.slice(0, 300) }; }
    if (!r.ok) throw new Error(`Mailchimp ${r.status} on ${path.split("?")[0]}: ${(b && (b.detail || b.title)) || "error"}`);
    return b;
  };

  const url = new URL(req.url);
  try {
    const segRes = await mc(`/lists/${AUDIENCE_ID}/segments?type=saved&count=1000&fields=segments.id,segments.name,segments.member_count,segments.updated_at`);
    const existing = new Map((segRes.segments || []).map((s) => [s.name, s]));
    const defs = segmentDefs();

    if (req.method === "POST" && url.searchParams.get("action") === "setup") {
      const created = [];
      for (const d of defs) {
        if (existing.has(d.name)) continue;
        await mc(`/lists/${AUDIENCE_ID}/segments`, { method: "POST", body: JSON.stringify({ name: d.name, options: { match: "all", conditions: d.conditions } }) });
        created.push(d.name);
      }
      return json({ ok: true, created, already: defs.length - created.length });
    }

    const phases = {};
    const missing = [];
    for (const d of defs) {
      const s = existing.get(d.name);
      if (s) phases[d.key] = { count: s.member_count, segment_id: s.id, as_of: s.updated_at };
      else missing.push(d.name);
    }

    // Flow emails: Customer Journey steps show up as campaigns whose titles start with the touch code.
    // Regular campaign drafts (the original T1-H3 source drafts) are excluded by type.
    const since = "2026-09-01T00:00:00+00:00";
    const camp = await mc(`/campaigns?count=1000&since_create_time=${encodeURIComponent(since)}&fields=campaigns.id,campaigns.web_id,campaigns.type,campaigns.status,campaigns.emails_sent,campaigns.create_time,campaigns.send_time,campaigns.settings.title,campaigns.settings.subject_line,campaigns.report_summary,total_items`);
    const types = {};
    const emails = [];
    for (const c of camp.campaigns || []) {
      types[c.type] = (types[c.type] || 0) + 1;
      const title = (c.settings && c.settings.title) || "";
      const m = title.match(CODE_RE);
      if (!m || c.type === "regular") continue;
      const rs = c.report_summary || {};
      emails.push({
        code: m[1], title, subject: c.settings.subject_line || "", web_id: c.web_id, type: c.type, status: c.status,
        sent: c.emails_sent || 0, opens: rs.unique_opens ?? null, open_rate: rs.open_rate ?? null,
        clicks: rs.subscriber_clicks ?? null, click_rate: rs.click_rate ?? null,
      });
    }

    // Unsubscribes per email need the report endpoint; only fetch for emails that have sent.
    await Promise.all(emails.filter((e) => e.sent > 0).map(async (e) => {
      const c = (camp.campaigns || []).find((x) => x.web_id === e.web_id);
      try {
        const r = await mc(`/reports/${c.id}?fields=unsubscribed,bounces,opens.open_rate,clicks.click_rate`);
        e.unsubs = r.unsubscribed ?? null;
        e.bounces = r.bounces ? (r.bounces.hard_bounces || 0) + (r.bounces.soft_bounces || 0) : null;
      } catch (_) { /* report not ready yet */ }
    }));

    return json({
      ok: true,
      fetched_at: new Date().toISOString(),
      phases,
      segments_missing: missing,
      emails,
      campaign_types_seen: types,
      note: missing.length ? "Phase segments are not set up yet. Run setup once to create them." : undefined,
    });
  } catch (err) {
    return json({ ok: false, error: String(err.message || err) }, 502);
  }
};

export const config = { path: "/api/teacher-nurture" };
