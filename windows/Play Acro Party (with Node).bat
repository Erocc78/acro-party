@echo off
title Acro Party
cd /d "%~dp0.."
where node 1>NUL 2>NUL
if errorlevel 1 goto nonode
node desktop\launcher.js
pause
exit /b
:nonode
echo.
echo   Node.js is not installed. Install the LTS version from https://nodejs.org,
echo   or use the standalone app built with the Build Acro Party app file.
echo.
pause
