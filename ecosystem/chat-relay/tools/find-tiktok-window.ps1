Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left, Top, Right, Bottom;
    }
}
"@

$proc = Get-Process | Where-Object { $_.MainWindowTitle -like "*TikTok*" }
foreach ($p in $proc) {
    $rect = New-Object Win32+RECT
    [Win32]::GetWindowRect($p.MainWindowHandle, [ref]$rect) | Out-Null
    Write-Host "Process: $($p.ProcessName) | Title: $($p.MainWindowTitle) | PID: $($p.Id)"
    Write-Host "  Window: Left=$($rect.Left) Top=$($rect.Top) Right=$($rect.Right) Bottom=$($rect.Bottom)"
    Write-Host "  Size: $($rect.Right - $rect.Left) x $($rect.Bottom - $rect.Top)"
}
