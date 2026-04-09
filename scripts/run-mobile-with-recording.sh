#!/bin/bash
set +e

ARTIFACTS="$GITHUB_WORKSPACE/qa-artifacts"
mkdir -p "$ARTIFACTS"

echo "=== Downloading and installing APK ==="
gh release download mobile-apk-v1 -p "app-debug.apk" -D /tmp -R DumitracheBogdan/Hydro-QA --clobber || true
adb install /tmp/app-debug.apk && echo "APK installed" || echo "APK install failed"

echo "=== Launching Hydrocert app ==="
adb shell am start -n com.hydrocert.app/.MainActivity 2>/dev/null || \
adb shell monkey -p com.hydrocert.app -c android.intent.category.LAUNCHER 1 2>/dev/null || true
sleep 5
echo "App should be visible now"

# Use adb screenrecord piped through a subshell to handle background properly
echo "=== Starting screen recording ==="
nohup adb shell screenrecord --time-limit 180 /sdcard/test-video.mp4 > /dev/null 2>&1 &
sleep 3
# Verify screenrecord is running on device
adb shell "pidof screenrecord" && echo "screenrecord is running on device" || echo "WARNING: screenrecord not found on device"

echo "=== Running mobile Maestro tests ==="
npm install -g maestro 2>/dev/null || true
cd "$GITHUB_WORKSPACE"
node scripts/qa-maestro-mobile-smoke.mjs || echo "Mobile tests completed with errors"

echo "=== Stopping screen recording ==="
# Send SIGINT to screenrecord on the DEVICE (not local)
adb shell "kill -INT \$(pidof screenrecord)" 2>/dev/null || true
echo "Waiting for video to finalize..."
sleep 5

echo "=== Pulling video from device ==="
adb pull /sdcard/test-video.mp4 "$ARTIFACTS/mobile-test-recording.mp4" 2>&1

FILE_SIZE=$(stat -c%s "$ARTIFACTS/mobile-test-recording.mp4" 2>/dev/null || echo "0")
echo "Video size: ${FILE_SIZE} bytes ($(( FILE_SIZE / 1024 )) KB)"

if [ "$FILE_SIZE" -lt 50000 ]; then
  echo "WARNING: Video too small. Trying alternative: adb exec-out screencap for final state"
  adb exec-out screencap -p > "$ARTIFACTS/mobile-final-state.png" 2>/dev/null || true
fi

echo "=== Done ==="
