#!/bin/bash
# Bidirectional parity orchestrator — runs inside the Android emulator job.
# Phases: 0 setup (API) -> 1 web->mobile (Maestro) -> 2 mobile->web (Maestro) -> 3 verify+report (API)
set +e
WS="${GITHUB_WORKSPACE:-$(pwd)}"; cd "$WS"
ART="$WS/qa-artifacts/parity"; SHOTS="$ART/screenshots"; LOGS="$ART/logs"
mkdir -p "$SHOTS" "$LOGS"

echo "=== Install Maestro ==="
if ! command -v maestro >/dev/null 2>&1; then
  curl -Ls "https://get.maestro.mobile.dev" | bash
  export PATH="$HOME/.maestro/bin:$PATH"
fi
maestro --version || { echo "::error::maestro install failed"; exit 1; }

# NOTE: must be a DEBUG build. The release build is hardwired to PROD (env switcher is
# gated behind BuildConfig.DEBUG), so it cannot target dev. app-debug.apk defaults to dev.
echo "=== Download + install APK (debug build, defaults to dev) ==="
gh release download mobile-apk-v1 -p app-debug.apk -D /tmp -R "$GITHUB_REPOSITORY" --clobber || { echo "::error::APK download failed"; exit 1; }
adb uninstall com.hydrocert.app >/dev/null 2>&1
adb install /tmp/app-debug.apk && echo "APK installed" || { echo "::error::APK install failed"; exit 1; }

dismiss_anr () {
  # The debug build can ANR on cold start. Dismiss the "Wait" button if the dialog is up.
  for _ in 1 2 3 4; do
    local foc; foc=$(adb shell dumpsys window 2>/dev/null | grep -m1 mCurrentFocus)
    echo "$foc" | grep -q "Application Not Responding" || return 0
    adb shell uiautomator dump /sdcard/anr.xml >/dev/null 2>&1
    local b; b=$(adb shell cat /sdcard/anr.xml 2>/dev/null | grep -oE 'text="Wait"[^>]*bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' | grep -oE '\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]' | head -1)
    if [ -n "$b" ]; then
      local x1 y1 x2 y2; x1=$(echo "$b"|sed -E 's/\[([0-9]+),([0-9]+)\].*/\1/'); y1=$(echo "$b"|sed -E 's/\[([0-9]+),([0-9]+)\].*/\2/')
      x2=$(echo "$b"|sed -E 's/.*\]\[([0-9]+),([0-9]+)\]/\1/'); y2=$(echo "$b"|sed -E 's/.*\]\[([0-9]+),([0-9]+)\]/\2/')
      adb shell input tap $(((x1+x2)/2)) $(((y1+y2)/2)) >/dev/null 2>&1
    fi
    sleep 5
  done
}

launch_login () {
  # Maestro 2.4 launchApp does not reliably foreground this build, so we clear + launch
  # via adb (explicit activity) and let the flow drive the login screen. The debug build
  # cold-starts slowly -> give it generous settle time, then clear any ANR before Maestro.
  adb shell pm clear com.hydrocert.app >/dev/null 2>&1
  adb shell am start -n com.hydrocert.app/.MainActivity >/dev/null 2>&1
  sleep 20
  dismiss_anr
}

run_flow () { # $1 = flow file
  local f="$1" name; name=$(basename "$f" .yaml)
  launch_login
  adb exec-out screencap -p > "$SHOTS/${name}-before.png" 2>/dev/null
  maestro test \
    -e MAESTRO_APP_EMAIL="$MAESTRO_APP_EMAIL" -e MAESTRO_APP_PASSWORD="$MAESTRO_APP_PASSWORD" \
    -e VISIT_REF="$VISIT_REF" -e RUN_ID="$RUN_ID" "$f" 2>&1 | tee "$LOGS/${name}.log"
  local code=${PIPESTATUS[0]}
  adb exec-out screencap -p > "$SHOTS/${name}-after.png" 2>/dev/null
  return $code
}
st () { [ "$1" -eq 0 ] && echo PASS || echo FAIL; }

# ---- Phase 0: setup (API) ----
echo "=== Phase 0: setup ==="
node scripts/parity/setup-data.mjs || { echo "::error::setup failed"; exit 1; }
VISIT_REF=$(node -e "console.log(require('./parity-context.json').visitRef)")
export VISIT_REF; echo "visitRef=$VISIT_REF"

# ---- Phase 1: web -> mobile (one flow per check) ----
echo "=== Phase 1: web->mobile ==="
run_flow mobile-flows-parity/p01a_web2mobile_description.yaml; A=$?
run_flow mobile-flows-parity/p01b_web2mobile_visit_actions.yaml; B=$?
C2C='SKIP'
if [ -f mobile-flows-parity/p01c_web2mobile_inspection_actions.yaml ]; then
  run_flow mobile-flows-parity/p01c_web2mobile_inspection_actions.yaml; C=$?; C2C=$(st $C)
fi
node -e "const fs=require('fs');const checks=[
 {id:'2a-description',direction:'Web->Mobile',status:'$(st $A)',details:'p01a'},
 {id:'2b-visit-actions',direction:'Web->Mobile',status:'$(st $B)',details:'p01b'}];
 if('$C2C'!=='SKIP')checks.push({id:'2c-inspection-actions',direction:'Web->Mobile',status:'$C2C',details:'p01c'});
 fs.writeFileSync('parity-mobile-results.json',JSON.stringify({checks}))"

# ---- Phase 2: mobile -> web (input + save) ----
echo "=== Phase 2: mobile->web ==="
run_flow mobile-flows-parity/p02_mobile2web_signature.yaml
run_flow mobile-flows-parity/p03_mobile2web_visit_info.yaml
run_flow mobile-flows-parity/p04_mobile2web_risk_assessment.yaml

# ---- Phase 3: verify (API) + report ----
echo "=== Phase 3: verify + report ==="
node scripts/parity/verify-data.mjs
node scripts/parity/gen-report.mjs
cp -f summary.json report.html "$ART/" 2>/dev/null
echo "=== DONE ==="; cat summary.json
