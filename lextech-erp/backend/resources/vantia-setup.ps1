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
$payload = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($b64))

function Show-VantiaError([string]$message) {
  try {
    Add-Type -AssemblyName PresentationFramework -ErrorAction Stop
    [System.Windows.MessageBox]::Show($message, 'Vantia', 'OK', 'Error') | Out-Null
  } catch {
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
    [System.Windows.Forms.MessageBox]::Show($message, 'Vantia') | Out-Null
  }
}

try {
  if ($payload.StartsWith('{')) {
    $data = $payload | ConvertFrom-Json
    if (-not $data.url) { throw 'No se recibió una URL válida.' }

    $tempRoot = Join-Path $env:LOCALAPPDATA 'Vantia\TempOpen'
    if (!(Test-Path $tempRoot)) { New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null }

    Get-ChildItem -Path $tempRoot -File -ErrorAction SilentlyContinue |
      Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-2) } |
      Remove-Item -Force -ErrorAction SilentlyContinue

    $originalName = [string]$data.name
    if ([string]::IsNullOrWhiteSpace($originalName)) { $originalName = 'documento' }
    $safeName = [IO.Path]::GetFileName($originalName)
    if ([string]::IsNullOrWhiteSpace($safeName)) { $safeName = 'documento' }

    $ext = [IO.Path]::GetExtension($safeName)
    $baseName = [IO.Path]::GetFileNameWithoutExtension($safeName)
    if ([string]::IsNullOrWhiteSpace($baseName)) { $baseName = 'documento' }
    if ($baseName.Length -gt 80) { $baseName = $baseName.Substring(0, 80) }

    $targetPath = Join-Path $tempRoot ("{0}-{1}{2}" -f $baseName, ([guid]::NewGuid().ToString('N')), $ext)

    Invoke-WebRequest -Uri $data.url -OutFile $targetPath -UseBasicParsing
    Start-Process -FilePath $targetPath
    exit 0
  }

  Start-Process $payload
} catch {
  Show-VantiaError("No se pudo abrir el archivo desde Vantia.`r`n`r`n" + $_.Exception.Message)
  exit 1
}
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
Write-Host "  Vantia descargara el archivo a una carpeta temporal y lo abrira automaticamente." -ForegroundColor Green
Write-Host ""
Read-Host "  Pulsa Enter para cerrar"
