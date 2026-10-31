# chrome-rea.ps1 — fecha o Chrome e reabre com CDP para o REA MCP
# Uso: botão direito > "Executar com PowerShell"
#   ou:  powershell -ExecutionPolicy Bypass -File .\chrome-rea.ps1

$ErrorActionPreference = 'SilentlyContinue'
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$port   = 9222

if (-not (Test-Path $chrome)) {
    Write-Host "Chrome nao encontrado em $chrome" -ForegroundColor Red
    exit 1
}

# 1. Fecha de forma graciosa (preserva a sessao para restauracao)
Write-Host "Fechando o Chrome..."
Get-Process chrome | Where-Object { $_.MainWindowHandle -ne 0 } |
    ForEach-Object { $_.CloseMainWindow() | Out-Null }
Start-Sleep -Seconds 3

$restantes = (Get-Process chrome | Measure-Object).Count
if ($restantes -gt 0) {
    Write-Host "Ainda $restantes processo(s) em segundo plano; encerrando..."
    Get-Process chrome | Stop-Process -Force
    Start-Sleep -Seconds 2
}

# 2. Reabre com CDP em loopback + restaura as abas anteriores
Write-Host "Reabrindo com CDP em 127.0.0.1:$port ..."
Start-Process $chrome -ArgumentList @(
    "--remote-debugging-port=$port",
    "--remote-allow-origins=*",
    "--restore-last-session"
)
Start-Sleep -Seconds 5

# 3. Verifica
$listen = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($listen) {
    Write-Host "OK: CDP ativo em 127.0.0.1:$port" -ForegroundColor Green
    try {
        $v = Invoke-RestMethod "http://127.0.0.1:$port/json/version"
        Write-Host ("Browser: " + $v.Browser)
    } catch { }
} else {
    Write-Host "FALHOU: CDP nao subiu. O Chrome nao fechou por completo?" -ForegroundColor Red
    Write-Host "Verifique o Gerenciador de Tarefas por processos chrome.exe residuais."
}
