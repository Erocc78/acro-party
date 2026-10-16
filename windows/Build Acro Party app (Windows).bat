@echo off
title Building Acro Party
cd /d "%~dp0.."
where node 1>NUL 2>NUL
if errorlevel 1 goto nonode
node tools\build-app.js
echo.
pause
exit /b
:nonode
echo.
echo   Node.js is needed to BUILD the app, not to play it.
echo   Install the LTS version from https://nodejs.org, then double-click this file again.
echo.
pause
