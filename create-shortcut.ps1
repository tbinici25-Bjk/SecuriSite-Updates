$WshShell = New-Object -comObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$Shortcut = $WshShell.CreateShortcut("$DesktopPath\Site Güvenlik.lnk")
$Shortcut.TargetPath = "C:\Users\tarik\.gemini\antigravity\scratch\site-guvenlik\baslat-electron.bat"
$Shortcut.WorkingDirectory = "C:\Users\tarik\.gemini\antigravity\scratch\site-guvenlik"
$Shortcut.IconLocation = "C:\Users\tarik\.gemini\antigravity\scratch\site-guvenlik\assets\icon.ico"
$Shortcut.Save()
Write-Host "Kısayol başarıyla masaüstüne oluşturuldu."
