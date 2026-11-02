param(
    [Parameter(Mandatory = $true)][string]$Version,
    [ValidateSet('stable', 'testing', 'ci')][string]$Channel = 'ci',
    [switch]$RequireSignature
)
$ErrorActionPreference = 'Stop'
$bundleDirectory = Join-Path $PSScriptRoot '../src-tauri/target/release/bundle/nsis'
$installers = @(Get-ChildItem -LiteralPath $bundleDirectory -Filter '*.exe' -File)
if ($installers.Count -ne 1) { throw 'Expected exactly one NSIS installer.' }
$destination = Join-Path $PSScriptRoot '../release-assets'
New-Item -ItemType Directory -Path $destination -Force | Out-Null
$label = if ($Channel -eq 'testing') { 'beta' } else { $Channel }
$installerName = "Gemdrop_${Version}_${label}_windows-x64_setup.exe"
Copy-Item -LiteralPath $installers[0].FullName -Destination (Join-Path $destination $installerName)
$signaturePath = "$($installers[0].FullName).sig"
if (Test-Path -LiteralPath $signaturePath) {
    Copy-Item -LiteralPath $signaturePath -Destination (Join-Path $destination "$installerName.sig")
} elseif ($RequireSignature) {
    throw 'The signed updater artifact is missing its signature.'
}
$portable = Join-Path $PSScriptRoot '../src-tauri/target/release/gemdrop.exe'
if (-not (Test-Path -LiteralPath $portable)) { throw 'The portable native executable is missing.' }
Compress-Archive -LiteralPath $portable -DestinationPath (Join-Path $destination "Gemdrop_${Version}_${label}_windows-x64_portable.zip") -Force
$checksums = Get-ChildItem -LiteralPath $destination -File | Where-Object { $_.Name -ne 'SHA256SUMS.txt' } | Sort-Object Name | ForEach-Object {
    $checksum = Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256
    "$($checksum.Hash.ToLowerInvariant())  $($_.Name)"
}
$checksums | Set-Content -LiteralPath (Join-Path $destination 'SHA256SUMS.txt') -Encoding utf8
