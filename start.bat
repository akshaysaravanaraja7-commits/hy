@echo off
title ASTRA AI Companion
echo Starting ASTRA AI Embedded Full-Stack...
python run.py
if %ERRORLEVEL% NEQ 0 (
    py run.py
)
pause
