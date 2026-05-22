# Dev Launcher 本地启动（关闭本窗口或 Ctrl+C 即停止服务）
#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$ROOT = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location $ROOT

$ServerProcess = $null

function Stop-Server {
    if ($null -eq $script:ServerProcess -or $script:ServerProcess.HasExited) {
        return
    }
    Write-Host ''
    Write-Host '正在停止 Dev Launcher…'
    try {
        & taskkill /PID $script:ServerProcess.Id /T /F 2>$null | Out-Null
    } catch {
        Stop-Process -Id $script:ServerProcess.Id -Force -ErrorAction SilentlyContinue
    }
    $script:ServerProcess = $null
}

function Test-CommandAvailable([string]$Name) {
    $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Ensure-Command([string]$Name, [string]$Hint) {
    if (-not (Test-CommandAvailable $Name)) {
        Write-Host "错误: 未找到 $Name，请先安装。"
        Write-Host $Hint
        exit 1
    }
}

trap {
    Stop-Server
    if ($_ -is [System.Management.Automation.HaltCommandException]) {
        exit 0
    }
    throw $_
}

Write-Host '========================================'
Write-Host '  Dev Launcher'
Write-Host "  目录: $ROOT"
Write-Host '  关闭此窗口即停止服务'
Write-Host '========================================'
Write-Host ''

Ensure-Command 'node' '  Node.js: https://nodejs.org/ （需要 ≥ 20）'
Ensure-Command 'pnpm' '  pnpm:    npm install -g pnpm'

$nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 20) {
    $ver = node -v
    Write-Host "错误: 需要 Node.js ≥ 20，当前: $ver"
    exit 1
}

$configPath = Join-Path $ROOT 'config.json'
$examplePath = Join-Path $ROOT 'config.example.json'

if (-not (Test-Path $configPath)) {
    Write-Host '首次运行：从 config.example.json 生成 config.json'
    Copy-Item $examplePath $configPath
}

$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync('config.json','utf8'));process.exit(c.scanRoot&&String(c.scanRoot).trim()?0:1)"
$scanOk = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = $prevEap

if (-not $scanOk) {
    Write-Host ''
    Write-Host '请先在 config.json 中设置 scanRoot（你的项目根目录，其下含 App、Pc 等文件夹）。'
    Write-Host '示例: "C:\Users\你的用户名\Company"'
    Write-Host ''
    $ans = Read-Host '是否用记事本打开 config.json？[Y/n]'
    if ($ans -eq '' -or $ans -match '^[Yy]') {
        Start-Process notepad.exe $configPath
    }
    exit 1
}

if (-not (Test-Path (Join-Path $ROOT 'node_modules'))) {
    Write-Host '安装依赖（首次约需 1 分钟）…'
    & pnpm install --ignore-workspace
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$port = node -e "console.log(JSON.parse(require('fs').readFileSync('config.json')).port||5555)"
$hostAddr = node -e "console.log(JSON.parse(require('fs').readFileSync('config.json')).host||'127.0.0.1')"

$distEntry = Join-Path $ROOT 'dist\server\index.js'
if (-not (Test-Path $distEntry)) {
    Write-Host '编译服务端…'
    & pnpm run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "启动中… 面板地址: http://${hostAddr}:${port}"
Write-Host ''

try {
    $script:ServerProcess = Start-Process -FilePath 'pnpm' `
        -ArgumentList 'start' `
        -WorkingDirectory $ROOT `
        -PassThru `
        -NoNewWindow

    Wait-Process -Id $script:ServerProcess.Id
} finally {
    Stop-Server
}
