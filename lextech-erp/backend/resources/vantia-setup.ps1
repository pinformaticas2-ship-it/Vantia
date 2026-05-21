# ─────────────────────────────────────────────────────────────────────────────
# Vantia - Conector de apertura directa de Office
# Ejecutar UNA VEZ por equipo (doble clic → "Abrir con PowerShell").
# No requiere permisos de administrador.
# ─────────────────────────────────────────────────────────────────────────────
$ErrorActionPreference = 'Stop'

$vantiaDir  = Join-Path $env:APPDATA 'Vantia'
$helperPath = Join-Path $vantiaDir   'vantia-open.ps1'

if (!(Test-Path $vantiaDir)) { New-Item -ItemType Directory -Path $vantiaDir | Out-Null }

Set-Content -Path $helperPath -Encoding UTF8 -Value @'
param([string]$raw)
$b64 = ($raw -replace '^vantia:', '') -replace '-','+' -replace '_','/'
$pad = (4 - $b64.Length % 4) % 4
if ($pad -lt 4) { $b64 += '=' * $pad }
$uri = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($b64))
Start-Process $uri
'@

$base = 'HKCU:\Software\Classes\vantia'
New-Item -Path "$base\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path $base -Name '(Default)' -Value 'URL:Vantia Office Protocol'
Set-ItemProperty -Path $base -Name 'URL Protocol' -Value ''
Set-ItemProperty -Path "$base\shell\open\command" -Name '(Default)' `
  -Value "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$helperPath`" `"%1`""

Write-Host ""
Write-Host "  Conector Vantia instalado correctamente." -ForegroundColor Green
Write-Host "  La proxima vez que abras un archivo Word/Excel desde Vantia," -ForegroundColor Green
Write-Host "  Chrome preguntara 'Abrir Vantia?' una vez - marca 'Permitir siempre'." -ForegroundColor Green
Write-Host ""
Read-Host "  Pulsa Enter para cerrar"
