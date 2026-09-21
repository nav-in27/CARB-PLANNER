@echo off
title CARB-Planner — Indian Railways Block Planner
cd /d "%~dp0"
echo =================================================================
echo   CARB-Planner Launcher (SIH26027)
echo =================================================================
python start_project.py %*
if %ERRORLEVEL% NEQ 0 (
    echo [!] Python error or launcher exited with code %ERRORLEVEL%
    pause
)
