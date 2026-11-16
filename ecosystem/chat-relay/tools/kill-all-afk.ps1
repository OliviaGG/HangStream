$procs = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*afk-detector*' }
foreach ($p in $procs) {
    Write-Host "Killing PID $($p.ProcessId)"
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}
# Also kill cmd.exe running the batch loop
$cmds = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'cmd.exe' -and $_.CommandLine -like '*afk-detector*' }
foreach ($c in $cmds) {
    Write-Host "Killing cmd PID $($c.ProcessId)"
    Stop-Process -Id $c.ProcessId -Force -ErrorAction SilentlyContinue
}
Write-Host "Done"
