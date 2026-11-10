# Paid ads & AEO: env vars and known issues (monthly digest)

The monthly-digest SKILL.md lives outside this repo; no repo script calls LinkedIn/Google Ads. Run `python3 scripts/paid_ads_preflight.py` at the start of the paid-ads step to get clear failures (prints set/not set only).

## LinkedIn
- `LINKEDIN_AD_ACCOUNT_ID` = bare number **508696656** (no `urn:li:` prefix; scripts add `urn:li:sponsoredAccount:`). Use this account ONLY; ignore 514583150; 557224941 is REMOVED.
- Send `LinkedIn-Version: 202602` or later (202509 returns HTTP 426).
- Env vars live in the routine/environment settings, not the repo.

## Google Ads
Developer token is NO LONGER required (Google API Center banner, 2026); API access level is managed per Google Cloud project (the project that owns `GOOGLE_ADS_CLIENT_ID`). Needs: `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`, and `GOOGLE_ADS_LOGIN_CUSTOMER_ID` only if reached through a manager account.

**Verified working 2026-11-10** (Explorer access): token exchange at `https://oauth2.googleapis.com/token` returns scope `adwords`; `POST https://googleads.googleapis.com/v23/customers/{id}/googleAds:search` with `Authorization: Bearer`, plus `login-customer-id` (only if set) returns campaign rows. No `developer-token` header needed. Account currency is USD, time zone America/Los_Angeles.

Gotchas:
- The customer ID env vars were saved WITH dashes (123-456-7890). The API URL and `login-customer-id` header need digits only: strip with `re.sub(r"\D", "", v)`. The preflight now accepts dashes and prints a note.
- GAQL `FROM campaign` with a date segment also returns PAUSED/REMOVED campaigns with zero metrics; filter to rows with cost, impressions or clicks.
- `metrics.cost_micros` / 1,000,000 = dollars. Conversions are the default `metrics.conversions`.
- If it fails: `invalid_grant` = refresh token/client mismatch or 7-day expiry (OAuth consent screen in Testing mode; publish it to In production, then re-mint at the OAuth Playground with the same client, scope `https://www.googleapis.com/auth/adwords`); "only approved for test accounts" = Explorer access still pending or the account is not a test account; `USER_PERMISSION_DENIED` = the authorizing Google user cannot access the customer ID, or a manager's `login-customer-id` is missing.
- Open risk: if the OAuth consent screen is still in Testing mode, the refresh token expires every 7 days. Confirm it is set to In production.

## AEO (HubSpot `get_aeo_metrics`) - DECISION: not depended on
Kelsey cannot grant the HubSpot AEO permission (confirmed 2026-11-05: `get_aeo_metrics` still returns "You need access to additional permissions..."; her only seat is sales-enterprise). The monthly digest should not call it or treat it as a gap: skip the HubSpot AEO step and leave `aeo` as `{"run_status": "skipped_by_decision"}`. The Semrush AI Visibility PDFs and `data/aeo-audit.json` (MKT1 `mkt1_aeo_audit` local task, last updated 2026-09-29) are separate paths. The digest SKILL.md lives outside this repo and still needs its Step 3l removed or marked optional.
