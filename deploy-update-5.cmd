@echo off
setlocal
title 405 Bad Guys Parlays — Deploy Update 5

:: ── Navigate to repo ──────────────────────────────────────────────
cd /d "%USERPROFILE%\Documents\GitHub\sunday-syndicate" 2>nul || (
  cd /d "%USERPROFILE%\sunday-syndicate" 2>nul || (
    echo [ERROR] Cannot find sunday-syndicate repo.
    echo         Expected: %%USERPROFILE%%\Documents\GitHub\sunday-syndicate
    echo         or:       %%USERPROFILE%%\sunday-syndicate
    pause & exit /b 1
  )
)

echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║   405 BAD GUYS PARLAYS  —  Deploy Update 5      ║
echo  ║                                                  ║
echo  ║   Icon text + Cash App $Tique + build fix        ║
echo  ╚══════════════════════════════════════════════════╝
echo.

:: ── Safety: stash any local changes ─────────────────────────────
git stash --include-untracked >nul 2>&1

:: ── Apply the patch ─────────────────────────────────────────────
echo [1/4] Applying patch ...
git am --3way "%~dp00001-feat-405-Bad-Guys-Parlays-icon-text-Cash-App-Tique-b.patch"
if errorlevel 1 (
  echo.
  echo [WARN] git am failed — trying fallback apply ...
  git am --abort >nul 2>&1
  git apply --3way "%~dp00001-feat-405-Bad-Guys-Parlays-icon-text-Cash-App-Tique-b.patch"
  if errorlevel 1 (
    echo [ERROR] Patch did not apply cleanly.
    echo         Open a terminal, cd into the repo, and run:
    echo           git apply --3way "path\to\the\patch"
    pause & exit /b 1
  )
  git add -A
  git commit -m "feat: 405 Bad Guys Parlays icon text + Cash App $Tique + build fix"
)

:: ── Push ────────────────────────────────────────────────────────
echo.
echo [2/4] Pushing to GitHub ...
git push origin main
if errorlevel 1 (
  git push origin master
)

:: ── Done ────────────────────────────────────────────────────────
echo.
echo [3/4] Vercel auto-deploys from GitHub — watch https://vercel.com/dashboard
echo.
echo [4/4] Done! Changes included:
echo        - Jack icon now shows "405 BAD GUYS" + "PARLAYS" text
echo        - Cash App payment links default to $Tique
echo        - Admin instructions updated for direct $cashtag setup
echo        - Build error from Unicode smart quotes fixed
echo.
echo  Live at: https://sunday-syndicate.vercel.app
echo.
pause
