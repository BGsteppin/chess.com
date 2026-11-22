# windows-setup.ps1 — one-shot: install, build, write .env, login once, run.
# runtime: Windows PowerShell 5+ / PowerShell 7+ | repo root context required
# usage:  powershell -ExecutionPolicy Bypass -File scripts\windows-setup.ps1

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "==> repo root: $root" -ForegroundColor Cyan

# 1. locate chrome
$chromeCandidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) {
    Write-Host "Chrome not found in standard paths." -ForegroundColor Yellow
    $chrome = Read-Host "Enter full path to chrome.exe"
    if (-not (Test-Path $chrome)) { throw "chrome.exe not found at $chrome" }
}
Write-Host "==> Chrome: $chrome"

# 2. profile dir (dedicated, not your real one)
$profileDir = Join-Path $env:USERPROFILE ".chess-bot-profile"
if (-not (Test-Path $profileDir)) { New-Item -ItemType Directory -Path $profileDir | Out-Null }
Write-Host "==> profile: $profileDir"

# 3. prompt for strength / duration unless already set
$strength = $env:OPPONENT_STRENGTH
if (-not $strength) {
    $s = Read-Host "Opponent strength 1-30 [15]"
    $strength = if ($s) { $s } else { '15' }
}
$duration = $env:DURATION
if (-not $duration) {
    $d = Read-Host "Duration (Unlimited / 10 min / 5 | 5 / etc) [Unlimited]"
    $duration = if ($d) { $d } else { 'Unlimited' }
}

# 4. write .env
$envPath = Join-Path $root "packages\bot\.env"
$chromeForEnv = $chrome -replace '\\','/'
$profileForEnv = $profileDir -replace '\\','/'
@"
GAME_TYPE=computer
OPPONENT_STRENGTH=$strength
DURATION=$duration
SERVER_PORT=3000
SOCKET_PORT=3001
CHROME_PATH=$chromeForEnv
USER_DATA_DIR=$profileForEnv
HEADLESS=false
DEVTOOLS=true
"@ | Set-Content -Path $envPath -Encoding ASCII
Write-Host "==> wrote $envPath"

# 5. install + build
Write-Host "==> yarn install" -ForegroundColor Cyan
yarn
if ($LASTEXITCODE -ne 0) { throw "yarn install failed" }

Write-Host "==> lerna build" -ForegroundColor Cyan
npx lerna run build
if ($LASTEXITCODE -ne 0) { throw "build failed" }

# 6. one-time login
$loginSentinel = Join-Path $profileDir ".chess-com-logged-in"
if (-not (Test-Path $loginSentinel)) {
    Write-Host ""
    Write-Host "==> Launching Chrome with the bot profile." -ForegroundColor Yellow
    Write-Host "    1) sign into chess.com"
    Write-Host "    2) optionally browse one game so cookies warm up"
    Write-Host "    3) CLOSE Chrome completely"
    Write-Host ""
    Read-Host "press Enter to open Chrome"
    & $chrome --user-data-dir="$profileDir" "https://www.chess.com/login" | Out-Null
    New-Item -ItemType File -Path $loginSentinel -Force | Out-Null
}

# 7. run bot
Write-Host ""
Write-Host "==> starting bot (lerna run start:bot)" -ForegroundColor Green
npx lerna run start:bot
