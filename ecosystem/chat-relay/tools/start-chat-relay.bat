@echo off
cd /d "C:\Chat Relay"
:loop
"C:\Program Files\nodejs\node.exe" "C:\Chat Relay\server.js" >> "C:\Chat Relay\tools\chat-relay-local.log" 2>&1
echo [%date% %time%] Chat Relay exited, restarting in 5 seconds... >> "C:\Chat Relay\tools\chat-relay-local.log"
timeout /t 5 /nobreak >nul
goto loop
