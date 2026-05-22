@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dev-launcher.ps1"
set ERR=%ERRORLEVEL%
if %ERR% neq 0 pause
endlocal
exit /b %ERR%
