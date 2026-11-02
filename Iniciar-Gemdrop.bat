@echo off
setlocal
cd /d "%~dp0"
where bun >nul 2>nul
if errorlevel 1 (
  echo Instale o Bun: https://bun.sh
  pause
  exit /b 1
)
if not exist node_modules (
  call bun install --frozen-lockfile
  if errorlevel 1 goto failed
)
call bun run app
if errorlevel 1 goto failed
exit /b 0
:failed
echo.
echo Nao foi possivel iniciar. Confira os requisitos no README.md.
pause
exit /b 1
