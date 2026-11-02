@echo off
setlocal
cd /d "%~dp0"
where bun >nul 2>nul
if errorlevel 1 (
  echo Instale o Bun: https://bun.sh
  pause
  exit /b 1
)
if not exist node_modules call bun install --frozen-lockfile
start "Gemdrop - preview" cmd /k "bun run dev"
powershell -NoProfile -Command "$limit = (Get-Date).AddSeconds(30); do { try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:1427' -UseBasicParsing -TimeoutSec 1; if ($r.StatusCode -eq 200) { break } } catch {}; Start-Sleep -Milliseconds 300 } while ((Get-Date) -lt $limit); $chrome = @('C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', ($env:LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe')) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1; if ($chrome) { Start-Process -FilePath $chrome -ArgumentList '--new-tab','http://127.0.0.1:1427' } else { Start-Process 'http://127.0.0.1:1427' }"
