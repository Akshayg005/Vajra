# One-command start (Windows PowerShell):  .\scripts\dev.ps1  [-Seed 1234] [-NoApi]
param([int]$Seed = 0, [switch]$NoApi)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $NoApi) {
  $env:VAJRA_SEED = if ($Seed -gt 0) { "$Seed" } else { '' }
  $py = Join-Path $root 'apps\api\.venv\Scripts\python.exe'
  if (Test-Path $py) {
    Write-Host 'Starting API on http://localhost:8000 (Swagger: /docs)' -ForegroundColor Cyan
    Start-Process -FilePath $py -ArgumentList '-m','uvicorn','app.main:app','--port','8000' -WorkingDirectory (Join-Path $root 'apps\api') -WindowStyle Minimized
  } else {
    Write-Host 'API venv not found - run .\scripts\setup.ps1 first. The web app still works offline on its local engine.' -ForegroundColor Yellow
  }
}
$url = 'http://localhost:5173/'
if ($Seed -gt 0) { $url = "http://localhost:5173/?seed=$Seed" }
Write-Host "Starting web app on $url" -ForegroundColor Cyan
Start-Process $url
Set-Location $root
npm run dev
