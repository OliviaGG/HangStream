# Install TikTok AFK Detector as a Windows Scheduled Task
# Runs at user logon, restarts if it crashes

$taskName = "TikTokAFKDetector"
$nodePath = "C:\Program Files\nodejs\node.exe"
$scriptPath = "C:\Chat Relay\tools\tiktok-afk-detector.js"
$workDir = "C:\Chat Relay"

# Remove existing task if present
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Removed existing task: $taskName"
}

# Create action
$action = New-ScheduledTaskAction -Execute $nodePath -Argument $scriptPath -WorkingDirectory $workDir

# Trigger: at user logon
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

# Settings: restart on failure, don't stop on idle, run indefinitely
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -DontStopOnIdleEnd `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 0) `
    -StartWhenAvailable

# Register
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Description "Monitors TikTok Live Studio for AFK verification popups and sends Discord DM alerts"

Write-Host ""
Write-Host "Task '$taskName' installed successfully!"
Write-Host "  Trigger: At logon for user $env:USERNAME"
Write-Host "  Action: node $scriptPath"
Write-Host "  Restarts: Up to 3 times on failure (1 min interval)"
Write-Host ""
Write-Host "To start now: Start-ScheduledTask -TaskName '$taskName'"
Write-Host "To check status: Get-ScheduledTask -TaskName '$taskName'"
Write-Host "To remove: Unregister-ScheduledTask -TaskName '$taskName'"
