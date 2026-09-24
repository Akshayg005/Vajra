# Seed-locked rehearsal: same storms, same alerts, every run.  .\scripts\rehearsal.ps1 [-Seed 2026]
param([int]$Seed = 2026)
& (Join-Path $PSScriptRoot 'dev.ps1') -Seed $Seed
