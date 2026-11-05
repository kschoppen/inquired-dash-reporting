# Paid ads & AEO: env vars and known issues (monthly digest)

The monthly-digest SKILL.md lives outside this repo; no repo script calls LinkedIn/Google Ads. Run `python3 scripts/paid_ads_preflight.py` at the start of the paid-ads step to get clear failures (prints set/not set only).

## LinkedIn
- `LINKEDIN_AD_ACCOUNT_ID` = bare number **508696656** (no `urn:li:` prefix; scripts add `urn:li:sponsoredAccount:`). Use this account ONLY; ignore 514583150; 557224941 is REMOVED.
- Send `LinkedIn-Version: 202602` or later (202509 returns HTTP 426).
- Env vars live in the routine/environment settings, not the repo.

## Google Ads (needs all of)
`GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID` (10 digits), and `GOOGLE_ADS_LOGIN_CUSTOMER_ID` if reached via a manager account. Missing as of 2026-11-05: developer token, refresh token, customer ID, login customer ID.

## AEO (HubSpot `get_aeo_metrics`)
Run log error: "You need access to additional permissions to perform this action..." -> `aeo.run_status = no_permission`. Cause is the HubSpot connector's user/scope lacking AEO access, not repo code. Separately, `data/aeo-audit.json` comes from the MKT1 `mkt1_aeo_audit` local task, a different path.
