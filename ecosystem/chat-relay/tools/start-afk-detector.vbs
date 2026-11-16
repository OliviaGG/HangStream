Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Chat Relay"
WshShell.Run """C:\Program Files\nodejs\node.exe"" ""C:\Chat Relay\tools\tiktok-afk-detector.js""", 0, False
