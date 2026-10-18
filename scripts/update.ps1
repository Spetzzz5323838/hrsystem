# Оновлення бойового сервера з GitHub (запускати на сервері, в корені проєкту):
#   powershell -ExecutionPolicy Bypass -File scripts\update.ps1
#
# Що робить: показує, що нового -> бекап бази -> git pull -> залежності -> міграції -> збірка -> перезапуск -> перевірка.
# Зупиняється на першій помилці. Бекап лежить у папці backups\ (зберігаються останні 14).
# Сервер завжди оновлюється з гілки master; розробка йде в гілці dev (див. docs/deployment.md).

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

function Step($text) { Write-Host ""; Write-Host "==> $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host ""; Write-Host "ПОМИЛКА: $text" -ForegroundColor Red; exit 1 }

# ---- 0. Перевірки ----
if (-not (Test-Path ".env")) { Fail "Немає файлу .env. Це не бойовий сервер або папка не та." }
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne "master") { Fail "Сервер має бути на гілці master, а зараз: $branch. Виконайте: git checkout master" }
if (git status --porcelain --untracked-files=no) { Fail "На сервері є локальні зміни файлів коду. Їх не повинно бути: покажіть результат команди 'git status' розробнику." }

# ---- 1. Що нового ----
Step "Що нового на GitHub"
git fetch origin master
$incoming = git log --oneline HEAD..origin/master
if (-not $incoming) { Write-Host "Нових оновлень немає. Система вже актуальна." -ForegroundColor Green; exit 0 }
$incoming | ForEach-Object { Write-Host "  $_" }

Write-Host ""
Write-Host "Опис оновлень (з docs/updates.md):" -ForegroundColor Yellow
$oldNotes = git show "HEAD:docs/updates.md" 2>$null
$newNotes = git show "origin/master:docs/updates.md" 2>$null
if ($newNotes) {
    $oldLen = if ($oldNotes) { @($oldNotes).Count } else { 0 }
    @($newNotes) | Select-Object -First ([Math]::Max(0, @($newNotes).Count - $oldLen)) | ForEach-Object { Write-Host "  $_" }
}
Write-Host ""
$answer = Read-Host "Оновити? Введіть 'так' для продовження"
if ($answer -ne "так") { Write-Host "Скасовано."; exit 0 }

# ---- 2. Бекап бази ----
Step "Бекап бази даних"
$envLine = Get-Content ".env" | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
if (-not $envLine) { Fail "У .env немає DATABASE_URL" }
$dbUrl = ($envLine -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
$dbUrl = ($dbUrl -split '\?')[0]   # pg_dump не знає параметра ?schema=
New-Item -ItemType Directory -Force -Path "backups" | Out-Null
$backup = "backups\hrsystem-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".dump"
pg_dump --format=custom --file=$backup $dbUrl
if ($LASTEXITCODE -ne 0) { Fail "Не вдалося зробити бекап (pg_dump). Оновлення НЕ виконано, система не чіпалась." }
Write-Host "Бекап: $backup" -ForegroundColor Green
Get-ChildItem "backups\*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item -Force

# ---- 3. Код, залежності, міграції, збірка ----
$before = (git rev-parse HEAD).Trim()
$restore = "Якщо система не працює після оновлення: pm2 stop all; відновіть базу: pg_restore --clean --if-exists --dbname=`"$dbUrl`" $backup ; поверніть код: git reset --hard $before ; npm ci ; npm run build ; pm2 restart all"
try {
    Step "Завантаження коду"
    git pull --ff-only origin master
    if ($LASTEXITCODE -ne 0) { throw "git pull не вдався" }

    Step "Залежності"
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci не вдався" }

    Step "Міграції бази"
    npx dotenv -e .env -- npx prisma generate
    if ($LASTEXITCODE -ne 0) { throw "prisma generate не вдався" }
    npx dotenv -e .env -- npx prisma migrate deploy
    if ($LASTEXITCODE -ne 0) { throw "міграції не вдалися" }

    Step "Збірка"
    $env:NODE_ENV = "production"
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "збірка не вдалася" }

    Step "Перезапуск"
    pm2 restart all
    if ($LASTEXITCODE -ne 0) { throw "pm2 restart не вдався" }

    Step "Перевірка"
    Start-Sleep -Seconds 8
    $status = (Invoke-WebRequest -Uri "http://localhost:3010/login" -UseBasicParsing -TimeoutSec 20).StatusCode
    if ($status -ne 200) { throw "сайт відповів кодом $status" }
}
catch {
    Write-Host ""
    Write-Host "ПОМИЛКА під час оновлення: $_" -ForegroundColor Red
    Write-Host $restore -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Готово. Систему оновлено, сайт відповідає." -ForegroundColor Green
Write-Host "Бекап перед оновленням: $backup"
pm2 status
