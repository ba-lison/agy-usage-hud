@echo off
chcp 65001 >nul
echo ========================================================
echo  Vinculando AGY - UsageHUD ao Antigravity via Junction
echo ========================================================
echo.
echo Feche o Antigravity antes de continuar para liberar a pasta.
pause

if exist "C:\Users\aliso\.gemini\config\plugins\usage-hud" (
    rmdir /S /Q "C:\Users\aliso\.gemini\config\plugins\usage-hud"
)

mklink /J "C:\Users\aliso\.gemini\config\plugins\usage-hud" "%~dp0."

echo.
echo Pronto! Agora a pasta do Antigravity aponta diretamente para este projeto.
pause
