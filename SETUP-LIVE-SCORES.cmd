@echo off
title 405 BADGUYS PARLAY - Live Score Setup
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-live-scores.ps1"
echo.
pause
