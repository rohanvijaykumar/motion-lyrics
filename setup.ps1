# One-step setup for Windows. Installs anything missing (Node.js, Git, uv),
# then all packages, models and the render browser.
#   Right-click > "Run with PowerShell", or:  powershell -ExecutionPolicy Bypass -File setup.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Have($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}

if (-not (Have "node")) {
  if (-not (Have "winget")) { throw "Please install Node.js LTS from https://nodejs.org, then run this again." }
  Write-Host "Installing Node.js..."
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements --silent
  Refresh-Path
}
if (-not (Have "git")) {
  if (Have "winget") {
    Write-Host "Installing Git..."
    winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements --silent
    Refresh-Path
  }
}

Write-Host "Installing packages..."
npm install --no-fund --no-audit
Write-Host "Installing the audio tools and models (about 3 GB, once)..."
npm run setup
npm run doctor
