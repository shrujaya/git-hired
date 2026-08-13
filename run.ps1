<#
.SYNOPSIS
    Start the Git-Hired backend or frontend.

.EXAMPLE
    .\run.ps1 backend     # FastAPI server
    .\run.ps1 frontend    # Vite dev server
#>

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('backend', 'frontend')]
    [string]$Target
)

# Deliberately not 'Stop': uvicorn and vite log to stderr, and Windows
# PowerShell turns native-process stderr into ErrorRecords, which would abort
# the dev server on its own startup banner.
$ErrorActionPreference = 'Continue'

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvPy   = Join-Path $RepoRoot '.venv\Scripts\python.exe'
$Frontend = Join-Path $RepoRoot 'agentic-interviewer'

if ($Target -eq 'backend') {
    if (-not (Test-Path $VenvPy)) {
        Write-Host 'error: no virtualenv found at .venv - run .\setup.ps1 first' -ForegroundColor Red
        exit 1
    }
    # server.py resolves its own paths, but uvicorn's reloader imports the app
    # by name, so run from the directory that holds it.
    Push-Location (Join-Path $RepoRoot 'server\backend')
    try {
        & $VenvPy server.py
    } finally {
        Pop-Location
    }
} else {
    if (-not (Test-Path (Join-Path $Frontend 'node_modules'))) {
        Write-Host 'error: frontend dependencies missing - run .\setup.ps1 first' -ForegroundColor Red
        exit 1
    }
    Push-Location $Frontend
    try {
        & npm.cmd run dev
    } finally {
        Pop-Location
    }
}
