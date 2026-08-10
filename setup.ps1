<#
.SYNOPSIS
    Git-Hired development setup for Windows.

.DESCRIPTION
    The PowerShell counterpart to setup.sh. Idempotent: safe to re-run after
    pulling changes. Creates .venv\ for the Python backend, installs frontend
    node_modules, and seeds server\.env.

.PARAMETER Python
    Path to a specific Python 3.9-3.12 interpreter, for when auto-detection
    cannot find one (a conda environment, say, or a non-registered install).

.EXAMPLE
    .\setup.ps1

    If PowerShell refuses to run the script, allow local scripts for this
    session only:
        Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

.EXAMPLE
    .\setup.ps1 -Python C:\Users\me\anaconda3\envs\py312\python.exe
#>

param(
    [string]$Python
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Venv     = Join-Path $RepoRoot '.venv'
$VenvPy   = Join-Path $Venv 'Scripts\python.exe'
$Frontend = Join-Path $RepoRoot 'agentic-interviewer'

# --- pretty output ---------------------------------------------------------
function Write-Step { param($m) Write-Host "`n==> $m" -ForegroundColor White }
function Write-Ok   { param($m) Write-Host '    ' -NoNewline; Write-Host '/' -ForegroundColor Green -NoNewline; Write-Host " $m" }
function Write-Warn { param($m) Write-Host '    ' -NoNewline; Write-Host '!' -ForegroundColor Yellow -NoNewline; Write-Host " $m" }
function Die {
    param($m)
    Write-Host "`nerror: " -ForegroundColor Red -NoNewline
    Write-Host "$m`n"
    exit 1
}

# Run a native executable, letting its output through, and return its exit
# code. Same ErrorRecord hazard as below, so 'Stop' is relaxed for the call.
function Invoke-Native {
    param([string]$Exe, [string[]]$Arguments = @())
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        # Out-Host, not bare output: anything a PowerShell function writes to
        # the output stream becomes part of its return value, so letting the
        # command's stdout through would return an array of log lines with the
        # exit code buried at the end.
        & $Exe @Arguments 2>&1 | Out-Host
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prev
    }
}

# Run a native executable silently and return its exit code.
#
# Calling one inline and redirecting its streams (`2>$null`, `*>$null`) is not
# safe here: Windows PowerShell wraps every stderr line from a native process
# in an ErrorRecord, which $ErrorActionPreference='Stop' turns into a fatal
# error even when the program exited 0. mediapipe logs to stderr on success,
# so that misfires. Start-Process keeps the streams away from the PS pipeline.
function Invoke-NativeQuiet {
    param([string]$Exe, [string[]]$Arguments = @())
    $out = [System.IO.Path]::GetTempFileName()
    $err = [System.IO.Path]::GetTempFileName()
    try {
        $params = @{
            FilePath               = $Exe
            NoNewWindow            = $true
            Wait                   = $true
            PassThru               = $true
            RedirectStandardOutput = $out
            RedirectStandardError  = $err
        }
        if ($Arguments.Count -gt 0) { $params['ArgumentList'] = $Arguments }
        return (Start-Process @params).ExitCode
    } catch {
        return 1
    } finally {
        Remove-Item $out, $err -Force -ErrorAction SilentlyContinue
    }
}

# --- 1. virtualenv ---------------------------------------------------------
# mediapipe 0.10.21 publishes no wheels for 3.13+, and the repo's floor is 3.9.
Write-Step 'Setting up virtualenv at .venv'

$VersionCheck = 'import sys; sys.exit(0 if (3,9) <= sys.version_info[:2] <= (3,12) else 1)'

# Uses the call operator rather than Invoke-NativeQuiet: Start-Process joins
# ArgumentList on spaces without quoting, which would split the -c snippet
# across argv and make every interpreter look broken.
function Test-PythonVersion {
    param([string]$Exe, [string[]]$PreArgs = @())
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Exe @PreArgs -c $VersionCheck 2>&1 | Out-Null
        return $LASTEXITCODE -eq 0
    } finally {
        $ErrorActionPreference = $prev
    }
}

# A venv built from a different interpreter than the one selected below will
# silently install into the wrong Python; rebuild when that happens.
if (Test-Path $Venv) {
    if (-not (Test-Path $VenvPy)) {
        Write-Warn 'existing .venv looks broken - recreating'
        Remove-Item -Recurse -Force $Venv
    } elseif (-not (Test-PythonVersion -Exe $VenvPy)) {
        Write-Warn 'existing .venv has an unsupported Python - recreating'
        Remove-Item -Recurse -Force $Venv
    }
}

# Only go looking for a system interpreter when one is actually needed. A
# working .venv is enough to re-run setup, even on a machine whose only
# PATH Python is too new.
if (Test-Path $Venv) {
    Write-Ok "reusing existing .venv ($(& $VenvPy -V))"
} else {
    $PythonExe  = $null
    $PythonArgs = @()

    # An explicit -Python wins over detection, and is the escape hatch when the
    # only suitable interpreter is somewhere this script would never look.
    if ($Python) {
        if (-not (Test-Path $Python)) { Die "-Python path does not exist: $Python" }
        if (-not (Test-PythonVersion -Exe $Python)) {
            Die "-Python $Python is not in the supported 3.9-3.12 range"
        }
        $PythonExe = (Resolve-Path $Python).Path
    }

    # An activated conda/virtual environment is a deliberate choice by whoever
    # is running this, so prefer it over whatever happens to be on PATH.
    if (-not $PythonExe) {
        foreach ($prefix in $env:CONDA_PREFIX, $env:VIRTUAL_ENV) {
            if (-not $prefix) { continue }
            foreach ($rel in 'python.exe', 'Scripts\python.exe', 'bin/python') {
                $candidate = Join-Path $prefix $rel
                if ((Test-Path $candidate) -and (Test-PythonVersion -Exe $candidate)) {
                    $PythonExe = $candidate; break
                }
            }
            if ($PythonExe) { break }
        }
    }

    # The py launcher is the reliable way to reach a specific version on
    # Windows; bare `python` often resolves to the Microsoft Store stub or a
    # 3.13+ install.
    if (-not $PythonExe -and (Get-Command py -ErrorAction SilentlyContinue)) {
        foreach ($ver in '3.12', '3.11', '3.10', '3.9') {
            if (Test-PythonVersion -Exe 'py' -PreArgs @("-$ver")) {
                $PythonExe = 'py'; $PythonArgs = @("-$ver"); break
            }
        }
    }

    if (-not $PythonExe) {
        foreach ($name in 'python3.12', 'python3.11', 'python3.10', 'python3.9', 'python3', 'python') {
            $cmd = Get-Command $name -ErrorAction SilentlyContinue
            if ($cmd -and (Test-PythonVersion -Exe $cmd.Source)) {
                $PythonExe = $cmd.Source; break
            }
        }
    }

    if (-not $PythonExe) {
        $found = 'none found'
        $cmd = Get-Command python -ErrorAction SilentlyContinue
        if ($cmd) { $found = (& $cmd.Source -V 2>&1) }
        Die @"
need Python 3.9-3.12 (mediapipe has no 3.13+ wheels); found: $found
    winget install Python.Python.3.12
    or download from https://www.python.org/downloads/

    Already have one somewhere this did not look? Point at it directly:
      .\setup.ps1 -Python C:\path\to\python.exe
"@
    }
    Write-Ok "using $(& $PythonExe @PythonArgs -V) at $PythonExe $PythonArgs"

    if ((Invoke-Native -Exe $PythonExe -Arguments ($PythonArgs + @('-m', 'venv', $Venv))) -ne 0) {
        Die 'could not create venv'
    }
    Write-Ok "created ($(& $VenvPy -V))"
}

if (-not (Test-Path $VenvPy)) { Die "venv created but $VenvPy is missing - delete .venv and re-run" }

# --- 2. install Python dependencies ---------------------------------------
Write-Step 'Installing Python dependencies'
Invoke-Native -Exe $VenvPy -Arguments @('-m', 'pip', 'install', '--quiet', '--upgrade', 'pip') | Out-Null
$rc = Invoke-Native -Exe $VenvPy -Arguments @('-m', 'pip', 'install', '--quiet', '-r', (Join-Path $RepoRoot 'requirements.txt'))
if ($rc -ne 0) { Die 'dependency install failed (see output above)' }
Write-Ok 'installed from requirements.txt'

# The failure this guards against is silent at install time and only shows up
# as a RuntimeError when the server imports mediapipe.
Write-Step 'Verifying mediapipe / protobuf compatibility'
$probe = @'
import mediapipe as mp
mp.solutions.face_mesh.FaceMesh(max_num_faces=1)
'@
$probeFile = Join-Path $env:TEMP "githired-mediapipe-probe.py"
Set-Content -Path $probeFile -Value $probe -Encoding utf8
$probeOk = (Invoke-NativeQuiet -Exe $VenvPy -Arguments @($probeFile)) -eq 0
Remove-Item $probeFile -Force -ErrorAction SilentlyContinue

if ($probeOk) {
    $pbVersion = & $VenvPy -c 'import google.protobuf as p; print(p.__version__)'
    Write-Ok "mediapipe loads (protobuf $pbVersion)"
} else {
    Die @"
mediapipe failed to initialise.
    This is usually protobuf 5.x. Fix with:
      .venv\Scripts\python.exe -m pip install "protobuf>=4.25.3,<5"
"@
}

# --- 3. seed server.env ---------------------------------------------------
Write-Step 'Configuring server\.env'
$EnvFile = Join-Path $RepoRoot 'server\.env'
if (Test-Path $EnvFile) {
    Write-Ok '.env already exists - leaving it untouched'
} else {
    Copy-Item (Join-Path $RepoRoot 'server\.env.example') $EnvFile
    Write-Ok 'created server\.env from .env.example'
    Write-Warn 'add your ANTHROPIC_API_KEY to server\.env before starting the backend'
}

# --- 4. frontend -----------------------------------------------------------
Write-Step 'Installing frontend dependencies'
# npm.cmd, not npm: the bare name resolves to npm.ps1, which the default
# Restricted execution policy refuses to load. The .cmd shim is unaffected.
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    Write-Warn 'npm not found - skipping frontend.'
    Write-Warn 'Install Node 18+ from https://nodejs.org, then run: .\setup.ps1 again'
} else {
    Write-Ok "npm $(npm.cmd --version) / node $(node.exe --version)"
    Push-Location $Frontend
    try {
        # npm on Windows is npm.cmd; naming the shim explicitly keeps
        # PowerShell from resolving the extensionless name oddly.
        $rc = Invoke-Native -Exe 'npm.cmd' -Arguments @('install', '--no-fund', '--no-audit', '--loglevel=error')
        if ($rc -ne 0) { Die 'npm install failed (see output above)' }
    } finally {
        Pop-Location
    }
    Write-Ok 'installed agentic-interviewer\node_modules'
}

# --- done ------------------------------------------------------------------
$KeySet = $false
$Port = '8100'
if (Test-Path $EnvFile) {
    $lines = Get-Content $EnvFile
    $KeySet = [bool]($lines | Select-String -Pattern '^ANTHROPIC_API_KEY=.+' -Quiet)
    $portLine = $lines | Select-String -Pattern '^PORT=(\d+)' | Select-Object -Last 1
    if ($portLine) { $Port = $portLine.Matches[0].Groups[1].Value }
}

Write-Host "`n==> Setup complete`n" -ForegroundColor White
$n = 1
if (-not $KeySet) {
    Write-Host "  $n. Add your key to server\.env:  ANTHROPIC_API_KEY=sk-ant-..."
    $n++
}
Write-Host "  $n. Backend:   .\run.ps1 backend"
$n++
Write-Host "  $n. Frontend:  .\run.ps1 frontend   (separate terminal)`n"
Write-Host "  Backend  http://localhost:$Port  (docs at /docs)"
Write-Host "  Frontend http://localhost:5173`n"
