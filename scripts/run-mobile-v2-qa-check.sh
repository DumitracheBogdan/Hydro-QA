#!/bin/bash
set +e

# =============================================================
# Mobile V2 QA-Check: UI Change Detector (standalone)
# Installs the APK, runs the Python-based UI scanner against
# the running emulator, and writes results to qa-artifacts/.
# Does NOT run Maestro tests — ~10-15 min instead of 40-70.
# =============================================================

ARTIFACTS="$GITHUB_WORKSPACE/qa-artifacts/change-detector"
mkdir -p "$ARTIFACTS"

echo "=== Downloading and installing APK ==="
gh release download mobile-apk-v1 -p "app-debug.apk" -D /tmp -R DumitracheBogdan/Hydro-QA --clobber || true
adb install -r /tmp/app-debug.apk && echo "APK installed" || echo "APK install failed"

echo ""
echo "========================================="
echo "  QA-Check Mode — UI Change Detector"
echo "========================================="
echo ""

cd "$GITHUB_WORKSPACE/exploration-2026-04-12/change-detector"

# run_detector.py imports scanner.py and runs the full 24-screen scan + HTML report
python3 run_detector.py --ci --no-alert --output "$ARTIFACTS" 2>&1
EXIT_CODE=$?

if [[ "$EXIT_CODE" -ne 0 ]]; then
  echo "::warning::QA Change Detector exited with code $EXIT_CODE"
fi

echo "=== Generating Excel Report ==="
RESULT_FILE=$(ls -1t "$ARTIFACTS"/scan_results_*.json 2>/dev/null | head -1)
if [[ -n "$RESULT_FILE" ]]; then
  EXCEL_NAME="UIChangeDetector_Mobile_$(date +%Y-%m-%d).xlsx"
  EXCEL_PATH="$ARTIFACTS/$EXCEL_NAME"
  SCREENSHOTS_DIR="$GITHUB_WORKSPACE/exploration-2026-04-12/change-detector/screenshots"
  python3 "$GITHUB_WORKSPACE/scripts/generate_detector_excel.py" \
    --scan-json "$RESULT_FILE" \
    --output "$EXCEL_PATH" \
    --screenshots-dir "$SCREENSHOTS_DIR" 2>&1 || echo "::warning::Excel report generation failed"
  if [[ -f "$EXCEL_PATH" ]]; then
    echo "Excel report: $EXCEL_PATH"
    echo "excel_path=$EXCEL_PATH" >> "$GITHUB_OUTPUT"
    echo "excel_name=$EXCEL_NAME" >> "$GITHUB_OUTPUT"
  fi
else
  echo "::warning::No scan results found — skipping Excel generation"
fi

# Copy screenshots and any debug dumps into the artifact folder so we can
# inspect them after the run.
if [[ -d "screenshots" ]]; then
  echo "=== Copying screenshots/ into artifacts ==="
  cp -r screenshots "$ARTIFACTS/" || true
fi
if [[ -d "debug_dumps" ]]; then
  echo "=== Copying debug_dumps/ into artifacts ==="
  cp -r debug_dumps "$ARTIFACTS/" || true
fi

echo "=== QA-Check Done ==="

# CI gate (ON by default as of 27/27 detector validation). Fail the build
# when the detector reports new elements. Set FAIL_ON_NEW_ELEMENTS=0 to
# temporarily disable while doing exploratory work on new screens.
if [[ "$FAIL_ON_NEW_ELEMENTS" == "0" ]]; then
  echo "::warning::CI gate disabled via FAIL_ON_NEW_ELEMENTS=0 — returning success regardless of detector result"
  exit 0
fi

# Parse scan_results JSON for total_new_elements; exit 1 if > 0 even if
# the detector process itself exited 0 (the detector returns 0 on normal
# completion — we want the gate to key on the result, not the process).
RESULT_FILE=$(ls -1t "$ARTIFACTS"/scan_results_*.json 2>/dev/null | head -1)
if [[ -n "$RESULT_FILE" ]]; then
  TOTAL_NEW=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('summary',{}).get('total_new_elements',0))" "$RESULT_FILE")
  if [[ "$TOTAL_NEW" -gt 0 ]]; then
    echo "::error::UI Change Detector found $TOTAL_NEW new element(s) — failing the build."
    exit 1
  fi
  echo "UI Change Detector: 0 new elements — baseline matches."
fi

exit "$EXIT_CODE"
