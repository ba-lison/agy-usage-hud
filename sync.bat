@echo off
chcp 65001 >nul
echo [AGY UsageHUD] Sincronizando instalação local com Antigravity...

set "DEST=C:\Users\aliso\.gemini\config\plugins\usage-hud"
set "SRC=%~dp0."

if not exist "%DEST%" (
  mkdir "%DEST%"
)

REM Copia apenas os arquivos essenciais de runtime e plugins
copy /Y "%SRC%\plugin.json" "%DEST%\plugin.json" >nul
copy /Y "%SRC%\hooks.json" "%DEST%\hooks.json" >nul
if exist "%SRC%\README.md" copy /Y "%SRC%\README.md" "%DEST%\README.md" >nul

REM Copia sidecars
robocopy "%SRC%\sidecars\usage_hud" "%DEST%\sidecars\usage_hud" /E /XF *.tmp *.log /NDL /NFL /NJH /NJS >nul

REM Copia scripts de execução
robocopy "%SRC%\scripts" "%DEST%\scripts" /E /XF *.tmp *.log /NDL /NFL /NJH /NJS >nul

REM Copia skills
robocopy "%SRC%\skills" "%DEST%\skills" /E /XF *.tmp *.log /NDL /NFL /NJH /NJS >nul

echo [OK] Plugin AGY - UsageHUD (V7) sincronizado com sucesso em %DEST%!
