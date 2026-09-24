# One-time setup (Windows PowerShell). Run from the repo root:  .\scripts\setup.ps1
$ErrorActionPreference = 'Stop'
Write-Host 'Installing web dependencies (npm workspaces)...' -ForegroundColor Cyan
npm install
Write-Host 'Creating Python venv for the API...' -ForegroundColor Cyan
python -m venv apps\api\.venv
& apps\api\.venv\Scripts\python.exe -m pip install --upgrade pip
& apps\api\.venv\Scripts\python.exe -m pip install -r apps\api\requirements-dev.txt
Write-Host 'Done. Start everything with: .\scripts\dev.ps1' -ForegroundColor Green
