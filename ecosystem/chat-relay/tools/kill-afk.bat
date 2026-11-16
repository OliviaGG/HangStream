@echo off
for /f "tokens=2" %%a in ('wmic process where "CommandLine like '%%afk-detector%%'" get ProcessId /format:value ^| findstr ProcessId') do taskkill /F /PID %%a 2>nul
echo Done
