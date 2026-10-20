<#
.SYNOPSIS
    Runs the Cloudflare Tunnel and syncs your local laptop backend to your Render frontend.

.EXAMPLE
    .\run_tunnel.ps1
    .\run_tunnel.ps1 -Port 8000
    .\run_tunnel.ps1 -StartFrontend
#>

param(
    [int]$Port = 0,
    [int]$FrontendPort = 0,
    [string]$ServiceId = "",
    [switch]$NoDeploy,
    [switch]$StartFrontend
)

$ErrorActionPreference = "Stop"
$env:PYTHONUNBUFFERED = "1"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$pythonExe = Join-Path $scriptDir "backend\venv\Scripts\python.exe"

if (-not (Test-Path $pythonExe)) {
    $pythonExe = "python"
}

$argsList = @("scripts/connect_render.py")

if ($Port -gt 0) {
    $argsList += "--port"
    $argsList += $Port
}

if ($FrontendPort -gt 0) {
    $argsList += "--frontend-port"
    $argsList += $FrontendPort
}

if ($ServiceId -ne "") {
    $argsList += "--service-id"
    $argsList += $ServiceId
}

if ($NoDeploy) {
    $argsList += "--no-deploy"
}

if ($StartFrontend) {
    $argsList += "--start-frontend"
}

Write-Host "Launching LesionLens Cloudflare & Render CI/CD bridge..." -ForegroundColor Cyan
& $pythonExe $argsList
