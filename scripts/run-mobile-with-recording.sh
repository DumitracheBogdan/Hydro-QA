#!/bin/bash
set +e

echo "=== Emulator booted — downloading APK ==="
gh release download mobile-apk-v1 -p "app-debug.apk" -D /tmp -R DumitracheBogdan/Hydro-QA --clobber || true
adb install /tmp/app-debug.apk && echo "APK installed" || echo "APK install failed"

echo "=== Launching app ==="
adb shell am start -n com.hydrocert.app/.MainActivity 2>/dev/null || \
adb shell monkey -p com.hydrocert.app -c android.intent.category.LAUNCHER 1 2>/dev/null || true
sleep 5

echo "=== Starting screen recording (max 3 min) ==="
mkdir -p "$GITHUB_WORKSPACE/qa-artifacts"
adb shell "screenrecord --time-limit 180 /sdcard/mobile-test-recording.mp4" &
RECORD_PID=$!
echo "Recording PID: $RECORD_PID"
sleep 2

echo "=== Running mobile Maestro tests ==="
npm install -g maestro 2>/dev/null || true
cd "$GITHUB_WORKSPACE"
node scripts/qa-maestro-mobile-smoke.mjs || echo "Mobile tests completed with errors"

echo "=== Stopping recording ==="
kill $RECORD_PID 2>/dev/null || true
adb shell "kill -2 \$(ps -A -o PID,ARGS | grep screenrecord | grep -v grep | awk '{print \$1}')" 2>/dev/null || true
sleep 5

echo "=== Pulling video ==="
adb pull /sdcard/mobile-test-recording.mp4 "$GITHUB_WORKSPACE/qa-artifacts/mobile-test-recording.mp4" 2>&1 || echo "WARNING: pull failed"

FILE_SIZE=$(stat -c%s "$GITHUB_WORKSPACE/qa-artifacts/mobile-test-recording.mp4" 2>/dev/null || echo "0")
echo "Video size: ${FILE_SIZE} bytes ($(( FILE_SIZE / 1024 )) KB)"

echo "=== Mobile testing complete ==="
