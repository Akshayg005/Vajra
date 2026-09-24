# Production build + preview (Windows PowerShell):  .\scripts\build.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
npm run lint
npm run typecheck
npm run test
npm run build
Write-Host 'Preview at http://localhost:4173' -ForegroundColor Green
npm run preview
