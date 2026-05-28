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

# Suppress the system "isn't responding" dialog so a cold-start ANR never overlays (and blocks
# Maestro on) the login screen. Set once; harmless to repeat.
adb shell settings put global hide_error_dialogs 1 >/dev/null 2>&1

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
  local code=1
  # Retry once: cold-start ANR can occasionally keep the login screen from composing within
  # Maestro's window. All parity flows are idempotent (they set the same values), so a clean
  # relaunch + retry is safe and removes the flake.
  for attempt in 1 2; do
    launch_login
    [ "$attempt" -eq 1 ] && adb exec-out screencap -p > "$SHOTS/${name}-before.png" 2>/dev/null
    maestro test \
      -e MAESTRO_APP_EMAIL="$MAESTRO_APP_EMAIL" -e MAESTRO_APP_PASSWORD="$MAESTRO_APP_PASSWORD" \
      -e VISIT_REF="$VISIT_REF" -e RUN_ID="$RUN_ID" "$f" 2>&1 | tee "$LOGS/${name}.log"
    code=${PIPESTATUS[0]}
    [ "$code" -eq 0 ] && break
    echo "::warning::$name attempt $attempt failed (code $code); retrying"
  done
  adb exec-out screencap -p > "$SHOTS/${name}-after.png" 2>/dev/null
  return $code
}
st () { [ "$1" -eq 0 ] && echo PASS || echo FAIL; }

# ---- Phase 0: setup (API) ----
echo "=== Phase 0: setup ==="
node scripts/parity/setup-data.mjs || { echo "::error::setup failed"; exit 1; }
VISIT_REF=$(node -e "console.log(require('./parity-context.json').visitRef)")
export VISIT_REF; echo "visitRef=$VISIT_REF"
# Re-read RUN_ID from the context: in reuse mode setup derives it from the existing visit title, so
# the flow assertions (which read $RUN_ID) match the data on the reused visit, not github.run_id (M3).
RUN_ID=$(node -e "console.log(require('./parity-context.json').runId)")
export RUN_ID; echo "runId=$RUN_ID"

# ---- Phase 1: web -> mobile (one flow per check) ----
echo "=== Phase 1: web->mobile ==="
run_flow mobile-flows-parity/p01a_web2mobile_description.yaml; A=$?
run_flow mobile-flows-parity/p01b_web2mobile_visit_actions.yaml; B=$?
run_flow mobile-flows-parity/p01d_web2mobile_visit_text.yaml; D=$?
C2C='SKIP'
if [ -f mobile-flows-parity/p01c_web2mobile_inspection_actions.yaml ]; then
  run_flow mobile-flows-parity/p01c_web2mobile_inspection_actions.yaml; C=$?; C2C=$(st $C)
fi
node -e "const fs=require('fs');const checks=[
 {id:'2a-description',direction:'Web->Mobile',status:'$(st $A)',details:'p01a notes->Description card'},
 {id:'2b-visit-actions',direction:'Web->Mobile',status:'$(st $B)',details:'p01b'},
 {id:'2d-visit-text',direction:'Web->Mobile',status:'$(st $D)',details:'p01d waterSystemDescription->Description & Reference'}];
 if('$C2C'!=='SKIP')checks.push({id:'2c-inspection-actions',direction:'Web->Mobile',status:'$C2C',details:'p01c'});
 fs.writeFileSync('parity-mobile-results.json',JSON.stringify({checks}))"

# ---- Phase 1.5: clear web-seeded text via API so phase-2 mobile typing starts from an empty
#      field. Mobile eraseText is cursor-position-fragile on a prefilled multiline field (it
#      backspaces from the tap point and leaves a tail), so we clear server-side instead. ----
echo "=== Phase 1.5: clear web-seeded fields ==="
node -e "(async()=>{const{makeClient}=await import('./scripts/parity/api.mjs');const ctx=require('./parity-context.json');const c=makeClient(process.env.HYDROCERT_API_BASE);await c.login(process.env.API_EMAIL,process.env.API_PASSWORD);await c.patch('/visits/'+ctx.visitId,{waterSystemDescription:''});console.log('cleared waterSystemDescription')})().catch(e=>{console.error('WARN clear failed:',e.message)})"

# ---- Phase 2: mobile -> web (input + save). p05 now types into the cleared Description &
#      Reference field plus the (empty) Work Details / Water Sampling Details fields (3d). ----
echo "=== Phase 2: mobile->web ==="
run_flow mobile-flows-parity/p02_mobile2web_signature.yaml; P02=$?
run_flow mobile-flows-parity/p03_mobile2web_visit_info.yaml; P03=$?
run_flow mobile-flows-parity/p03b_mobile2web_site_induction.yaml; P03B=$?
run_flow mobile-flows-parity/p04_mobile2web_risk_assessment.yaml; P04=$?
run_flow mobile-flows-parity/p05_mobile2web_visit_text.yaml; P05=$?
# Record Phase-2 flow exit codes so verify-data can guard fixed-value checks (e.g. 3e) whose API
# read-back alone can't detect a silently-failed flow in reuse mode (M4).
node -e "require('fs').writeFileSync('parity-flow-status.json',JSON.stringify({p02:$P02,p03:$P03,p03b:$P03B,p04:$P04,p05:$P05}))"
echo "flow-status: p02=$P02 p03=$P03 p03b=$P03B p04=$P04 p05=$P05"

# ---- Phase 3: verify (API) + report ----
echo "=== Phase 3: verify + report ==="
node scripts/parity/verify-data.mjs; VERIFY=$?
node scripts/parity/gen-report.mjs
cp -f summary.json report.html "$ART/" 2>/dev/null

# SECURITY: scrub any secret values Maestro/curl may have echoed into the logs before they are
# uploaded as artifacts. GH masks secrets in the live console but NOT inside uploaded artifact
# files, and this repo is PUBLIC — an unscrubbed inputText echo would leak the login password.
LOGS="$LOGS" node -e '
  const fs=require("fs"),path=require("path");
  const secrets=[process.env.MAESTRO_APP_PASSWORD,process.env.API_PASSWORD,process.env.MOBILE_PASSWORD,process.env.MAESTRO_APP_EMAIL,process.env.MOBILE_EMAIL,process.env.API_EMAIL].filter(Boolean);
  const dir=process.env.LOGS;
  function walk(d){ if(!fs.existsSync(d))return; for(const e of fs.readdirSync(d,{withFileTypes:true})){ const p=path.join(d,e.name); if(e.isDirectory())walk(p); else if(/\.(log|txt|json)$/.test(e.name)){ let t=fs.readFileSync(p,"utf8"),o=t; for(const s of secrets) t=t.split(s).join("***REDACTED***"); if(t!==o) fs.writeFileSync(p,t);} } }
  try{ walk(dir); console.log("logs scrubbed for secrets"); }catch(e){ console.error("WARN scrub failed:",e.message); }
'

echo "=== DONE ==="; cat summary.json
# Propagate the verify gate result as the script's exit code (the workflow gate step also checks
# summary.json, but this makes a local run / the step status honest too) (H1).
exit ${VERIFY:-1}
