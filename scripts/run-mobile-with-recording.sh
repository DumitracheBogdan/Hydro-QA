#!/bin/bash
set +e

echo "=== Emulator booted — downloading APK ==="
gh release download mobile-apk-v1 -p "app-debug.apk" -D /tmp -R DumitracheBogdan/Hydro-QA --clobber || true
adb install /tmp/app-debug.apk && echo "APK installed" || echo "APK install failed"

echo "=== Starting screen recording in background (max 3 min) ==="
adb shell "screenrecord --time-limit 180 /sdcard/mobile-test-recording.mp4" &
RECORD_PID=$!
echo "Screen recording PID: $RECORD_PID"
sleep 3
echo "Verifying recording is running..."
adb shell "ps | grep screenrecord" || echo "screenrecord process not found on device"

echo "=== Running mobile Maestro tests ==="
npm install -g maestro 2>/dev/null || true
cd "$GITHUB_WORKSPACE"
node scripts/qa-maestro-mobile-smoke.mjs || echo "Mobile tests completed with errors"

echo "=== Stopping screen recording ==="
# Kill screenrecord on the device (sends SIGINT so it finalizes the mp4)
adb shell "kill -2 \$(ps -A | grep screenrecord | awk '{print \$2}')" 2>/dev/null || true
# Wait for the background process to finish and file to finalize
wait $RECORD_PID 2>/dev/null || true
sleep 3

echo "=== Pulling video from device ==="
mkdir -p "$GITHUB_WORKSPACE/qa-artifacts"
adb pull /sdcard/mobile-test-recording.mp4 "$GITHUB_WORKSPACE/qa-artifacts/mobile-test-recording.mp4" || echo "WARNING: Failed to pull video"

echo "=== Video file details ==="
ls -la "$GITHUB_WORKSPACE/qa-artifacts/mobile-test-recording.mp4" 2>/dev/null || echo "WARNING: No video file found"
FILE_SIZE=$(stat -c%s "$GITHUB_WORKSPACE/qa-artifacts/mobile-test-recording.mp4" 2>/dev/null || echo "0")
echo "Video file size: ${FILE_SIZE} bytes"

if [ "$FILE_SIZE" -lt 100000 ]; then
  echo "WARNING: Video file is suspiciously small (${FILE_SIZE} bytes). Recording may have failed."
fi

echo "=== Mobile testing complete ==="
