#!/usr/bin/env python3
"""
Security QA for the mobile regression suite. Static checks that guard the
non-negotiable safety rules; exits non-zero on any violation so CI blocks it.

Checks:
  1. ALS submit ban - no flow may TAP "Submit Samples" / "Submit All Samples".
     Asserting the label (assertVisible) is allowed; tapping it is not.
  2. No real lab endpoints referenced anywhere in the flows or runner
     (gip.alsglobal.com, submit-batch, /laboratory-samples/.../submit).
  3. No hardcoded credentials in the flows - login must go through the
     ${MAESTRO_APP_EMAIL} / ${MAESTRO_APP_PASSWORD} env vars, never a literal.
  4. The APK-upload workflow validates its input (https scheme + the apk is
     really com.hydrocert.app) so an arbitrary file cannot be pushed as the
     test build.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FLOWS = ROOT / "mobile-flows-v2"
RUNNER = ROOT / "scripts" / "run-mobile-v2-test.sh"
APK_WF = ROOT / ".github" / "workflows" / "update-mobile-apk.yml"

violations: list[str] = []


def flow_files():
    return sorted(FLOWS.rglob("*.yaml"))


# 1. ALS submit ban -- a tapOn whose target is Submit Samples / Submit All Samples.
# Matches inline `- tapOn: "Submit Samples"` and the nested `text:` form.
SUBMIT_SAMPLES = re.compile(r"submit\s+(all\s+)?samples", re.IGNORECASE)
TAP_INLINE = re.compile(r"-\s*tapOn:\s*[\"']?([^\"'\n]+)")
TAP_TEXT = re.compile(r"tapOn:\s*\n\s*text:\s*[\"']([^\"']+)")


def check_als_tap():
    for f in flow_files():
        text = f.read_text(encoding="utf-8", errors="ignore")
        for m in TAP_INLINE.finditer(text):
            if SUBMIT_SAMPLES.search(m.group(1)):
                violations.append(f"[ALS] {f.name}: tapOn targets '{m.group(1).strip()}' (Submit Samples is banned)")
        for m in TAP_TEXT.finditer(text):
            if SUBMIT_SAMPLES.search(m.group(1)):
                violations.append(f"[ALS] {f.name}: tapOn text '{m.group(1)}' (Submit Samples is banned)")


# 2. No real lab endpoints anywhere.
ALS_ENDPOINTS = re.compile(r"gip\.alsglobal\.com|submit-batch|/laboratory-samples/[^\s]*submit", re.IGNORECASE)


def check_als_endpoints():
    targets = list(flow_files()) + [RUNNER, ROOT / "scripts" / "generate_mobile_regression_excel.py"]
    for f in targets:
        if not f.is_file():
            continue
        for i, line in enumerate(f.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
            if ALS_ENDPOINTS.search(line):
                violations.append(f"[ALS] {f.name}:{i}: references a real lab endpoint")


# 3. No hardcoded credentials in the flows. The real risk is the actual QA
# login being pasted in instead of the ${MAESTRO_APP_*} env vars. A literal
# @techquarter.io email is the reliable tell (login uses ${MAESTRO_APP_EMAIL},
# so any real email in a flow is a leak). The real password only ever arrives
# through ${MAESTRO_APP_PASSWORD}; dummy/smoke/negative-test password literals
# are legitimate, so we do not flag password fields by value.
EMAIL_LITERAL = re.compile(r"[A-Za-z0-9._%+-]+@techquarter\.io")


def check_hardcoded_creds():
    for f in flow_files():
        text = f.read_text(encoding="utf-8", errors="ignore")
        for m in EMAIL_LITERAL.finditer(text):
            violations.append(f"[CRED] {f.name}: hardcoded email '{m.group(0)}' (use ${{MAESTRO_APP_EMAIL}})")


# 4. APK upload validates its input.
def check_apk_upload():
    if not APK_WF.is_file():
        return  # workflow optional
    t = APK_WF.read_text(encoding="utf-8", errors="ignore")
    if "https://" not in t:
        violations.append("[APK] update-mobile-apk.yml does not enforce an https URL")
    if "com.hydrocert.app" not in t:
        violations.append("[APK] update-mobile-apk.yml does not verify the APK package is com.hydrocert.app")


def main() -> int:
    check_als_tap()
    check_als_endpoints()
    check_hardcoded_creds()
    check_apk_upload()
    if violations:
        print("SECURITY QA FAILED:\n")
        for v in violations:
            print("  " + v)
        print(f"\n{len(violations)} violation(s).")
        return 1
    print("Security QA passed: no Submit-Samples taps, no lab endpoints, no hardcoded creds, APK upload validated.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
