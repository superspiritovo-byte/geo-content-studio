param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$port = if ($env:PORT) { $env:PORT } else { '18080' }
if ($port -notmatch '^\d+$' -or [int]$port -lt 1024 -or [int]$port -gt 65535) { throw 'PORT must be between 1024 and 65535.' }
$url = 'http://127.0.0.1:' + $port
$expectedWorkspace = $null
$locationFile = Join-Path $PSScriptRoot 'local-data.json'
if (Test-Path -LiteralPath $locationFile) {
    $location = Get-Content -LiteralPath $locationFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($location.version -ne 1 -or -not [System.IO.Path]::IsPathRooted($location.directory) -or -not $location.workspaceId) { throw 'Invalid local-data.json. Startup stopped to protect your workspace.' }
    if (-not $env:GEO_DATA_DIR -or $env:GEO_DATA_DIR -eq $location.directory) {
        if (-not (Test-Path -LiteralPath (Join-Path $location.directory 'geo.sqlite'))) { throw ('Workspace database missing. Startup stopped: ' + $location.directory) }
        $env:GEO_DATA_DIR = $location.directory
        $expectedWorkspace = $location.workspaceId
    }
}
function Test-GeoWebsite {
    try {
        $state = Invoke-RestMethod -Uri ($url + '/api/state') -TimeoutSec 3
        if ($expectedWorkspace -and $state.storage.workspaceId -ne $expectedWorkspace) { throw 'WRONG_WORKSPACE: This port is serving a different workspace. Stop that instance before restarting.' }
        return ($null -ne $state.settings -and $null -ne $state.worker -and $state.PSObject.Properties.Name -contains 'accounts')
    } catch { if ($_.Exception.Message -like 'WRONG_WORKSPACE:*') { throw }; return $false }
}
function Open-GeoWebsite {
    if (-not $NoBrowser) { Start-Process -FilePath $url }
    Write-Output ('Ready: ' + $url)
}
$startupMutex = New-Object System.Threading.Mutex($false, ('Local\GEOStudioStartup' + $port))
$ownsMutex = $false
try {
    try { $ownsMutex = $startupMutex.WaitOne(180000) } catch [System.Threading.AbandonedMutexException] { $ownsMutex = $true }
    if (-not $ownsMutex) { throw 'Startup is busy. Please wait and try again.' }
    if (Test-GeoWebsite) { Open-GeoWebsite; exit 0 }
    $env:NEXT_TELEMETRY_DISABLED = '1'
    $env:GEO_BUILD_DIR = '.next'
    if (-not $env:GEO_DATA_DIR) { $env:GEO_DATA_DIR = Join-Path $env:LOCALAPPDATA 'GEOStudio\data' }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 24+ is required.' }
    $nodeVersion = & node --version
    if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(\d+)\.') { throw 'Unable to read Node.js version.' }
    if ([int]$Matches[1] -lt 24) { throw 'Node.js 24+ is required.' }
    if (-not (Test-Path -LiteralPath 'node_modules/next/package.json')) {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed. See startup logs.' }
    $logDir = Join-Path $env:GEO_DATA_DIR 'logs'
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    $launchPath = Join-Path $PSScriptRoot 'scripts\launch.mjs'
    $launcher = Start-Process -FilePath (Get-Command node).Source -ArgumentList ('"' + $launchPath + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'launcher.log') -RedirectStandardError (Join-Path $logDir 'launcher-error.log') -PassThru
    $ready = $false
    for ($i = 0; $i -lt 90; $i++) {
        if (Test-GeoWebsite) { $ready = $true; break }
        if ($launcher.HasExited) { break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) { throw ('Website failed to start. Logs: ' + $logDir) }
    Open-GeoWebsite
} catch {
    if (-not $NoBrowser) {
        $message = $_.Exception.Message
        (New-Object -ComObject WScript.Shell).Popup($message, 0, 'GEO startup failed', 16) | Out-Null
    }
    Write-Error $_.Exception.Message
    exit 1
} finally {
    if ($ownsMutex) { $startupMutex.ReleaseMutex() }
    $startupMutex.Dispose()
}
