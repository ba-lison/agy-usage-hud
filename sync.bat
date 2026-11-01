@echo off
chcp 65001 >nul
echo [AGY UsageHUD] Sincronizando instalação local com Antigravity...

set "DEST=%USERPROFILE%\.gemini\config\plugins\usage-hud"
set "SRC=%~dp0."

if not exist "%DEST%" (
  mkdir "%DEST%"
)

REM Copia apenas os arquivos essenciais de runtime e plugins
copy /Y "%SRC%\plugin.json" "%DEST%\plugin.json" >nul
copy /Y "%SRC%\hooks.json" "%DEST%\hooks.json" >nul
if exist "%SRC%\README.md" copy /Y "%SRC%\README.md" "%DEST%\README.md" >nul
if exist "%SRC%\INTEGRACAO-V7.md" copy /Y "%SRC%\INTEGRACAO-V7.md" "%DEST%\INTEGRACAO-V7.md" >nul
if exist "%SRC%\LICENSE" copy /Y "%SRC%\LICENSE" "%DEST%\LICENSE" >nul
if exist "%SRC%\THIRD_PARTY_NOTICES.md" copy /Y "%SRC%\THIRD_PARTY_NOTICES.md" "%DEST%\THIRD_PARTY_NOTICES.md" >nul
if exist "%SRC%\LICENSES" robocopy "%SRC%\LICENSES" "%DEST%\LICENSES" /E /NDL /NFL /NJH /NJS >nul
if exist "%SRC%\assets" robocopy "%SRC%\assets" "%DEST%\assets" /E /NDL /NFL /NJH /NJS >nul

REM Copia sidecars
robocopy "%SRC%\sidecars\usage_hud" "%DEST%\sidecars\usage_hud" /E /XF *.tmp *.log /NDL /NFL /NJH /NJS >nul

REM Copia scripts de execução
robocopy "%SRC%\scripts" "%DEST%\scripts" /E /XF *.tmp *.log /NDL /NFL /NJH /NJS >nul

REM Copia skills
robocopy "%SRC%\skills" "%DEST%\skills" /E /XF *.tmp *.log /NDL /NFL /NJH /NJS >nul

echo [OK] Plugin AGY - UsageHUD (V7) sincronizado com sucesso em %DEST%!
