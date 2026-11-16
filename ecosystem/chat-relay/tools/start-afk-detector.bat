@echo off
cd /d "C:\Chat Relay"
:loop
echo [%date% %time%] Starting AFK detector... >> "C:\Chat Relay\tools\afk-detector.log"
"C:\Program Files\nodejs\node.exe" "C:\Chat Relay\tools\tiktok-afk-detector.js" >> "C:\Chat Relay\tools\afk-detector.log" 2>&1
echo [%date% %time%] Process exited, restarting in 5 seconds... >> "C:\Chat Relay\tools\afk-detector.log"
timeout /t 5 /nobreak >nul
goto loop
