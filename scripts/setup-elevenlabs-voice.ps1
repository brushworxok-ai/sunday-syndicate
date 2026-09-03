$ErrorActionPreference = 'Stop'

$projectPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectPath

Write-Host ''
Write-Host '405 BADGUYS PARLAY - Jack Voice Setup' -ForegroundColor Cyan
Write-Host 'Your key stays hidden and is sent only to your linked Vercel project.'
Write-Host ''

$secureKey = Read-Host 'Paste your ElevenLabs API key, then press Enter' -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
$plainKey = $null

try {
  $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
  if ([string]::IsNullOrWhiteSpace($plainKey)) {
    throw 'No API key was entered.'
  }

  Write-Host ''
  Write-Host 'Saving the key securely in Vercel...' -ForegroundColor Yellow
  $plainKey | & npx.cmd --yes vercel@latest env add JACK_TTS_API_KEY production,preview --force --sensitive --yes
  if ($LASTEXITCODE -ne 0) { throw 'Vercel could not save the API key.' }

  Write-Host ''
  Write-Host 'Redeploying 405 BADGUYS PARLAY...' -ForegroundColor Yellow
  & npx.cmd --yes vercel@latest --prod --yes
  if ($LASTEXITCODE -ne 0) { throw 'The production deployment did not complete.' }

  Write-Host ''
  Write-Host 'Checking Jack voice status...' -ForegroundColor Yellow
  $health = Invoke-RestMethod -Uri 'https://sunday-syndicate.vercel.app/api/health' -TimeoutSec 30
  if ($health.ttsProvider -eq 'elevenlabs' -and $health.ttsConfigured -eq $true) {
    Write-Host ''
    Write-Host 'CONFIGURED: Jack is set to ElevenLabs. Confirm the selected voice name in /api/tts/diagnose while signed in as commissioner.' -ForegroundColor Green
    Write-Host 'Open the app, sign in, open Ask Jack, and tap Read aloud.'
  } else {
    throw 'The deployment finished, but Jack voice is not reporting ready yet.'
  }
}
catch {
  Write-Host ''
  Write-Host "SETUP STOPPED: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'No key was saved in the app files. Hosting settings may already have been saved; check Vercel before retrying.'
  exit 1
}
finally {
  if ($keyPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
  }
  $plainKey = $null
  $secureKey = $null
}

