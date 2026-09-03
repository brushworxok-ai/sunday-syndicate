@echo off
setlocal
title 405 Badguys Parlay - Production Release Check

cd /d "%~dp0"
git rev-parse --is-inside-work-tree >nul 2>&1 || (
  echo [ERROR] This script must run from the application repository.
  exit /b 1
)

for /f "delims=" %%i in ('git status --porcelain') do (
  echo [ERROR] The working tree has uncommitted changes.
  echo         Commit or intentionally stash them before a production release.
  exit /b 1
)

echo [1/3] Installing the locked dependency tree...
call npm.cmd ci || exit /b 1

echo [2/3] Building and running the full test suite...
call npm.cmd run check || exit /b 1

echo [3/3] Release candidate is clean.
echo Deploy through the connected Vercel project after confirming its required
echo DATABASE_URL, ADMIN_PASSWORD, SESSION_SECRET, CRON_SECRET, and SMS secrets.
exit /b 0
