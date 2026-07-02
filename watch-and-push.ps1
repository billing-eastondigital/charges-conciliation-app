# Run this once at the start of a session with Claude.
# It watches for git-push.bat and runs it automatically when Claude creates it.
# To start: right-click this file → "Run with PowerShell"

$folder = "C:\Users\marco\Documents\recon-app-template"
$trigger = "git-push.bat"

Write-Host "Watching for $trigger in $folder..." -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop." -ForegroundColor Gray

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $folder
$watcher.Filter = $trigger
$watcher.NotifyFilter = [System.IO.NotifyFilters]::FileName

while ($true) {
    $result = $watcher.WaitForChanged([System.IO.WatcherChangeTypes]::Created, 5000)
    if (-not $result.TimedOut) {
        Write-Host "`nDetected $trigger — running in 1 second..." -ForegroundColor Yellow
        Start-Sleep -Seconds 1
        $batPath = Join-Path $folder $trigger
        if (Test-Path $batPath) {
            Start-Process -FilePath $batPath -Wait -NoNewWindow
            Write-Host "Done. Watching again..." -ForegroundColor Green
        }
    }
}
