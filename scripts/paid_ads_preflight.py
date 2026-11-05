#!/usr/bin/env python3
"""Preflight for the monthly digest's paid-ads pulls (stdlib only).

Checks env vars and exits non-zero with a specific message per problem.
Prints only set / not set -- never values. Usage:
  python3 scripts/paid_ads_preflight.py [linkedin|google|all]
"""
import os, re, sys

LI_VERSION_MIN = "202602"  # 202509 returns HTTP 426 NONEXISTENT_VERSION
GOOGLE_VARS = {
    "GOOGLE_ADS_DEVELOPER_TOKEN": "API Center of the Google Ads MANAGER account (ads.google.com/aw/apicenter)",
    "GOOGLE_ADS_CLIENT_ID": "Google Cloud OAuth client ID",
    "GOOGLE_ADS_CLIENT_SECRET": "Google Cloud OAuth client secret",
    "GOOGLE_ADS_REFRESH_TOKEN": "OAuth refresh token for a user with access to the account",
    "GOOGLE_ADS_CUSTOMER_ID": "10-digit Google Ads customer ID, digits only (no dashes)",
}

def linkedin():
    errs = []
    if not os.environ.get("LINKEDIN_ACCESS_TOKEN"):
        errs.append("LINKEDIN_ACCESS_TOKEN is not set.")
    v = os.environ.get("LINKEDIN_AD_ACCOUNT_ID", "")
    if not v:
        errs.append("LINKEDIN_AD_ACCOUNT_ID is not set. Expected the bare numeric ad account ID, e.g. 508696656.")
    elif not re.fullmatch(r"\d{6,12}", v):
        errs.append("LINKEDIN_AD_ACCOUNT_ID is not numeric (got %d characters, non-numeric). Expected the bare numeric ad account ID "
                    "(e.g. 508696656) -- no 'urn:li:sponsoredAccount:' prefix; scripts add it. A 14-char alphanumeric value is an app/client ID." % len(v))
    return errs

def google():
    errs = [f"{k} is not set ({why})." for k, why in GOOGLE_VARS.items() if not os.environ.get(k)]
    c = os.environ.get("GOOGLE_ADS_CUSTOMER_ID")
    if c and not re.fullmatch(r"\d{10}", c):
        errs.append("GOOGLE_ADS_CUSTOMER_ID must be 10 digits, no dashes.")
    l = os.environ.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID")
    if l and not re.fullmatch(r"\d{10}", l):
        errs.append("GOOGLE_ADS_LOGIN_CUSTOMER_ID must be 10 digits, no dashes.")
    if not l:
        print("note: GOOGLE_ADS_LOGIN_CUSTOMER_ID not set -- required only if the account is reached through a manager (MCC) account.")
    return errs

if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    errs = (linkedin() if which in ("linkedin", "all") else []) + (google() if which in ("google", "all") else [])
    for e in errs:
        print("PREFLIGHT FAIL:", e)
    if not errs:
        print("preflight ok (LinkedIn-Version must be >= %s)" % LI_VERSION_MIN)
    sys.exit(1 if errs else 0)
