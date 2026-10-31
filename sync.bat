@echo off
chcp 65001 >nul
echo Sincronizando AGY - UsageHUD com o Antigravity...
robocopy "%~dp0." "C:\Users\aliso\.gemini\config\plugins\usage-hud" /MIR /XD .git >nul
echo [OK] Plugin atualizado com sucesso no Antigravity!
timeout /t 2 >nul
