$ErrorActionPreference = 'Stop'

$projectPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectPath

Write-Host ''
Write-Host '405 BADGUYS PARLAY - Live Score Setup' -ForegroundColor Cyan
Write-Host 'This enables the current-season ESPN public scoreboard cache.'
Write-Host 'No score-provider key or payment is required.'
Write-Host ''

try {
  Write-Host 'Enabling the shared score cache in Vercel...' -ForegroundColor Yellow
  'espn' | & npm.cmd exec --cache .npm-cache --yes --package=vercel@latest -- vercel env add SCORES_PROVIDER production,preview --force --yes
  if ($LASTEXITCODE -ne 0) { throw 'Vercel could not enable the live-score provider.' }

  Write-Host ''
  Write-Host 'Redeploying 405 BADGUYS PARLAY...' -ForegroundColor Yellow
  & npm.cmd exec --cache .npm-cache --yes --package=vercel@latest -- vercel --prod --yes
  if ($LASTEXITCODE -ne 0) { throw 'The production deployment did not complete.' }

  Write-Host ''
  Write-Host 'Checking the production score feed...' -ForegroundColor Yellow
  $health = Invoke-RestMethod -Uri 'https://sunday-syndicate.vercel.app/api/health' -TimeoutSec 30
  if ($health.scoresProvider -ne 'espn' -or $health.scoresConfigured -ne $true) {
    throw 'The deployment finished, but the live-score provider is not reporting ready.'
  }

  $scores = Invoke-RestMethod -Uri 'https://sunday-syndicate.vercel.app/api/leagues/league-sunday-syndicate-demo/live-scores?season=2026&week=1' -TimeoutSec 30
  Write-Host ''
  if ($scores.sync.status -eq 'error') {
    Write-Host 'CONNECTED, BUT THE PROVIDER REJECTED THIS REFRESH.' -ForegroundColor Yellow
    Write-Host $scores.sync.error
    Write-Host 'The last saved scores remain visible. Run this setup again later.'
  } else {
    Write-Host 'SUCCESS: free current-season NFL scores are connected.' -ForegroundColor Green
    Write-Host "Feed state: $($scores.feedState). Saved games: $($scores.games.Count)."
    Write-Host 'Open Standings in the app. During games, the shared cache updates about every 2 minutes.'
  }
}
catch {
  Write-Host ''
  Write-Host "SETUP STOPPED: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'No key was written to the app files. You can safely run this setup again.'
  exit 1
}
finally {
}
