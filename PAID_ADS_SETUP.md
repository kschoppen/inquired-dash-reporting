# Paid ads & AEO: env vars and known issues (monthly digest)

The monthly-digest SKILL.md lives outside this repo; no repo script calls LinkedIn/Google Ads. Run `python3 scripts/paid_ads_preflight.py` at the start of the paid-ads step to get clear failures (prints set/not set only).

## LinkedIn
- `LINKEDIN_AD_ACCOUNT_ID` = bare number **508696656** (no `urn:li:` prefix; scripts add `urn:li:sponsoredAccount:`). Use this account ONLY; ignore 514583150; 557224941 is REMOVED.
- Send `LinkedIn-Version: 202602` or later (202509 returns HTTP 426).
- Env vars live in the routine/environment settings, not the repo.

## Google Ads (needs all of)
`GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID` (10 digits), and `GOOGLE_ADS_LOGIN_CUSTOMER_ID` if reached via a manager account. Missing as of 2026-11-05: developer token, refresh token, customer ID, login customer ID.

## AEO (HubSpot `get_aeo_metrics`) - DECISION: not depended on
Kelsey cannot grant the HubSpot AEO permission (confirmed 2026-11-05: `get_aeo_metrics` still returns "You need access to additional permissions..."; her only seat is sales-enterprise). The monthly digest should not call it or treat it as a gap: skip the HubSpot AEO step and leave `aeo` as `{"run_status": "skipped_by_decision"}`. The Semrush AI Visibility PDFs and `data/aeo-audit.json` (MKT1 `mkt1_aeo_audit` local task, last updated 2026-09-29) are separate paths. The digest SKILL.md lives outside this repo and still needs its Step 3l removed or marked optional.
