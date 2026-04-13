@echo off
REM ============================================================
REM  HydroCert UI Change Detector - Launcher
REM  Runs the detector from the correct working directory.
REM  All CLI args are forwarded: run_detector.bat --quick
REM ============================================================
cd /d C:\Users\Coca-Cola\Hydro-QA-work\exploration-2026-04-12\change-detector
python run_detector.py %*
pause
