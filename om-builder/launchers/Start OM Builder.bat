@echo off
rem Start OM Builder — double-click me. (If Windows warns: More info -> Run anyway.)
cd /d "%~dp0"
set "PATH=%cd%\runtime\python;%cd%\runtime\python\Scripts;%cd%\runtime\node;%PATH%"
"%cd%\runtime\node\node.exe" app\server.js
pause
