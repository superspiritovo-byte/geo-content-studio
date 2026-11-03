$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$env:NEXT_TELEMETRY_DISABLED = '1'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 24+ is required.' }
if ([int]((node -p 'process.versions.node.split(".")[0]')) -lt 24) { throw 'Node.js 24+ is required.' }
if (-not (Test-Path -LiteralPath 'node_modules/next/package.json')) {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed. See the error above.' }
& node scripts/launch.mjs
exit $LASTEXITCODE
