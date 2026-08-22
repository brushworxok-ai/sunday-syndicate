@echo off
title 405 BADGUYS PARLAY - Jack Voice Setup
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-elevenlabs-voice.ps1"
echo.
pause
