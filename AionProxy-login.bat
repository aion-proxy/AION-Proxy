@echo off
title AION-Login Proxy
cd /d "%~dp0"

if not exist .\settings\_aion-proxy_.json (
	bin\node.exe --use-strict bin\configurator
	cls
)

bin\node.exe --use-strict --harmony bin\cli\loginserver.js
pause