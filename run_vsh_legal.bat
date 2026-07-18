@echo off
title Track My Chambers Practice Manager
echo ==========================================================
echo   Track My Chambers Practice Manager Launcher
echo   Adv. Vaibhav Sharma - Chambers Administration
echo ==========================================================
echo.
echo Starting local web server...
echo Launching application in default browser...
echo.

:: Automatically open browser pointing to localhost:8000
start "" "http://localhost:8080/"

:: Execute Node.js server script in the current terminal window
"C:\Program Files\nodejs\node.exe" "%~dp0server.js"

echo.
echo Server stopped.
pause
