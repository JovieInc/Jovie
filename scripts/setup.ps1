#!/usr/bin/env pwsh
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SetupSh = Join-Path $ScriptDir "setup.sh"

if (-not (Test-Path -LiteralPath $SetupSh)) {
  Write-Error "Could not find setup.sh next to setup.ps1"
  exit 1
}

$candidates = @()

if ($env:GIT_BASH) {
  if ($env:GIT_BASH -notlike "*\Windows\System32\bash.exe") {
    $candidates += $env:GIT_BASH
  }
}

$programFiles = [Environment]::GetFolderPath("ProgramFiles")
$programFilesX86 = [Environment]::GetFolderPath("ProgramFilesX86")
$localAppData = [Environment]::GetFolderPath("LocalApplicationData")

if ($programFiles) {
  $candidates += (Join-Path $programFiles "Git\bin\bash.exe")
}
if ($programFilesX86) {
  $candidates += (Join-Path $programFilesX86 "Git\bin\bash.exe")
}
if ($localAppData) {
  $candidates += (Join-Path $localAppData "Programs\Git\bin\bash.exe")
}

$pathBash = Get-Command "bash.exe" -ErrorAction SilentlyContinue
if ($pathBash -and $pathBash.Source -notlike "*\Windows\System32\bash.exe") {
  $candidates += $pathBash.Source
}

$bash = $candidates |
  Where-Object { $_ -and (Test-Path -LiteralPath $_) } |
  Select-Object -First 1

if (-not $bash) {
  Write-Error @"
Git for Windows Bash was not found.

PowerShell resolves bash.exe to the Windows WSL launcher on some machines, which
can fail in automation sandboxes. Install Git for Windows or set GIT_BASH to the
full path of Git's bash.exe, then rerun:

  .\scripts\setup.ps1
"@
  exit 1
}

Write-Host "Using Git Bash: $bash"
& $bash $SetupSh @args
exit $LASTEXITCODE
