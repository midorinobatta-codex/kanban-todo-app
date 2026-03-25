@echo off
setlocal

REM Always run from repository root (directory of this script).
cd /d "%~dp0"

set PORT=3000

REM Rebuild before boot so running UI always matches latest source.
call npm run build
if errorlevel 1 (
  echo Build failed. FlowFocus did not start.
  exit /b 1
)

node .next\standalone\server.js
