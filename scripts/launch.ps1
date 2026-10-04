$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspacePath
$launchLogPath = Join-Path $workspacePath '.launch.log'

try {
    $sourceFiles = @(
        Get-ChildItem -LiteralPath (Join-Path $workspacePath 'src') -Recurse -File
        Get-Item -LiteralPath (Join-Path $workspacePath 'package.json'), (Join-Path $workspacePath 'electron.vite.config.ts')
    )
    $latestSource = ($sourceFiles | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).LastWriteTimeUtc
    $packageMetadata = Get-Content -LiteralPath (Join-Path $workspacePath 'package.json') -Raw | ConvertFrom-Json
    $packagedExe = Join-Path $workspacePath "release\$($packageMetadata.version)\win-unpacked\Marubako.exe"
    $packagedBundle = Join-Path $workspacePath "release\$($packageMetadata.version)\win-unpacked\resources\app.asar"

    if ((Test-Path -LiteralPath $packagedExe) -and (Test-Path -LiteralPath $packagedBundle) -and (Get-Item -LiteralPath $packagedBundle).LastWriteTimeUtc -ge $latestSource) {
        Start-Process -FilePath $packagedExe -WorkingDirectory (Split-Path -Parent $packagedExe) -WindowStyle Hidden
        exit 0
    }

    $electronExe = Join-Path $workspacePath 'node_modules\electron\dist\electron.exe'
    $electronInstaller = Join-Path $workspacePath 'node_modules\electron\install.js'
    if (!(Test-Path -LiteralPath $electronExe) -and (Test-Path -LiteralPath $electronInstaller)) {
        # Electron 44 and later fetch their runtime on first use, not while npm install runs.
        & node $electronInstaller *> $launchLogPath
    }
    if (!(Test-Path -LiteralPath $electronExe)) {
        throw 'Dependencies are missing. Run scripts\install.bat once, or install the Marubako Setup executable.'
    }
    $mainOutput = Join-Path $workspacePath 'out\main\index.js'
    $needsBuild = !(Test-Path -LiteralPath $mainOutput)
    if (!$needsBuild) {
        $needsBuild = (Get-Item -LiteralPath $mainOutput).LastWriteTimeUtc -lt $latestSource
    }
    if ($needsBuild) {
        $npmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
        & $npmCommand run build *> $launchLogPath
        if ($LASTEXITCODE -ne 0) { throw "Build failed. See $launchLogPath" }
    }
    Start-Process -FilePath $electronExe -ArgumentList '.' -WorkingDirectory $workspacePath -WindowStyle Hidden
} catch {
    $_ | Out-String | Add-Content -LiteralPath $launchLogPath
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Marubako', 'OK', 'Error') | Out-Null
    exit 1
}
