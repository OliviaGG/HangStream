Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like '*afk-detector*' } | ForEach-Object {
    Write-Host "Killing PID $($_.ProcessId): $($_.CommandLine)"
    Stop-Process -Id $_.ProcessId -Force
}
