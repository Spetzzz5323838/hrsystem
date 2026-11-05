# Оновлення бойового сервера з GitHub (запускати на сервері, в корені проєкту):
#   powershell -ExecutionPolicy Bypass -File scripts\update.ps1
#
# Що робить: показує, що нового -> бекап бази -> git pull -> зупинка сайту й бота -> залежності -> міграції -> збірка -> запуск -> перевірка.
# Зупиняється на першій помилці. Бекап лежить у папці backups\ (зберігаються останні 14).
# Увесь вивід дублюється в backups\update-<дата>.log, а вікно в кінці чекає Enter — помилку можна прочитати.
# Сервер завжди оновлюється з гілки master; розробка йде в гілці dev (див. docs/deployment.md).
#
# Якщо попереднє оновлення обірвалося ПІСЛЯ git pull (код уже новий, а залежності/міграції/збірка — ні),
# звичайний запуск скаже "Нових оновлень немає". Тоді продовжіть з того місця, без нового pull і бекапу:
#   powershell -ExecutionPolicy Bypass -File scripts\update.ps1 -Resume

param([switch]$Resume)

# Continue, не Stop: у Windows PowerShell 5.1 будь-який текст у stderr від git/npm (навіть інформаційний) інакше обривав би скрипт.
# Помилки команд перевіряються явно через $LASTEXITCODE.
$ErrorActionPreference = "Continue"
# UTF-8 у консолі: інакше кирилиця у виводі стає "╨д╨╛..." а введене "так" читається неправильно
try { & chcp.com 65001 | Out-Null } catch {}
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
[Console]::InputEncoding = $utf8
$OutputEncoding = $utf8
Set-Location (Split-Path -Parent $PSScriptRoot)

# Тільки наші процеси: bakerytrack на цьому ж сервері не чіпаємо (тому не "pm2 restart all").
$pm2Apps = @("hr-web", "hr-bot")

try {
    New-Item -ItemType Directory -Force -Path "backups" | Out-Null
    Start-Transcript -Path ("backups\update-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log") | Out-Null
} catch {}

function Step($text) { Write-Host ""; Write-Host "==> $text" -ForegroundColor Cyan }
# Вікно не закривається саме: інакше текст помилки зникає разом із ним.
function Finish($code) { Write-Host ""; Read-Host "Натисніть Enter, щоб закрити вікно" | Out-Null; exit $code }
function Fail($text) { Write-Host ""; Write-Host "ПОМИЛКА: $text" -ForegroundColor Red; Finish 1 }

# ---- 0. Перевірки ----
if (-not (Test-Path ".env")) { Fail "Немає файлу .env. Це не бойовий сервер або папка не та." }
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne "master") { Fail "Сервер має бути на гілці master, а зараз: $branch. Виконайте: git checkout master" }
if (git status --porcelain --untracked-files=no) { Fail "На сервері є локальні зміни файлів коду. Їх не повинно бути: покажіть результат команди 'git status' розробнику." }

# ---- 1. Що нового ----
if ($Resume) {
    Write-Host ""
    Write-Host "Режим -Resume: pull і бекап пропускаються, продовжуємо з залежностей (код уже завантажено попереднім запуском)." -ForegroundColor Yellow
    $backup = "(пропущено в режимі -Resume; дивіться бекап попереднього запуску в backups\)"
}
else {
Step "Що нового на GitHub"
git fetch origin master
if ($LASTEXITCODE -ne 0) { Fail "Не вдалося завантажити дані з GitHub (немає зв'язку або немає прав на папку .git). Оновлення НЕ виконано, систему не чіпали." }
$incoming = git log --oneline HEAD..origin/master
if (-not $incoming) {
    Write-Host "Нових оновлень немає. Система вже актуальна." -ForegroundColor Green
    Write-Host "Якщо попереднє оновлення обірвалося посередині (код новий, а сайт працює по-старому) — запустіть із ключем -Resume." -ForegroundColor Yellow
    Finish 0
}
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
$answer = Read-Host "Оновити? Введіть 'y' (або 'так') для продовження"
if ($answer -notmatch '^\s*(y|yes|так|да)\s*$') { Write-Host "Скасовано."; Finish 0 }

# ---- 2. Бекап бази ----
Step "Бекап бази даних"
$envLine = Get-Content ".env" | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
if (-not $envLine) { Fail "У .env немає DATABASE_URL" }
$dbUrl = ($envLine -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
$dbUrl = ($dbUrl -split '\?')[0]   # pg_dump не знає параметра ?schema=
New-Item -ItemType Directory -Force -Path "backups" | Out-Null
$backup = "backups\hrsystem-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".dump"
# pg_dump може бути не в PATH: шукаємо його і в стандартній папці PostgreSQL
$pgDump = (Get-Command pg_dump -ErrorAction SilentlyContinue).Source
if (-not $pgDump) { $pgDump = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_dump.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName }
if (-not $pgDump) { Fail "Не знайдено pg_dump. Оновлення НЕ виконано, система не чіпалась." }
& $pgDump --format=custom --file=$backup $dbUrl
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $backup) -or (Get-Item $backup).Length -eq 0) { Fail "Не вдалося зробити бекап (pg_dump). Оновлення НЕ виконано, система не чіпалась." }
Write-Host "Бекап: $backup" -ForegroundColor Green
Get-ChildItem "backups\*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item -Force
}

# ---- 3. Код, залежності, міграції, збірка ----
$before = (git rev-parse HEAD).Trim()
$dbUrlMasked = $dbUrl -replace '(://[^:]+:)[^@]+@', '$1***@'   # пароль не друкуємо
$apps = $pm2Apps -join " "
$restore = "Якщо система не працює після оновлення: pm2 stop $apps; відновіть базу: pg_restore --clean --if-exists --dbname=`"$dbUrlMasked`" $backup (пароль підставте з .env) ; поверніть код: git reset --hard $before ; npm ci ; npm run build ; pm2 restart $apps"
try {
    if (-not $Resume) {
        Step "Завантаження коду"
        git pull --ff-only origin master
        if ($LASTEXITCODE -ne 0) { throw "git pull не вдався" }
    }

    # Працюючий сайт тримає відкритим системний файл Next.js (next-swc*.node), і npm ci не може його замінити
    # (EPERM unlink) — оновлення обривалося посередині. Тому спершу зупиняємо тільки наші процеси.
    Step "Зупинка сайту й бота ($apps)"
    pm2 stop $pm2Apps
    if ($LASTEXITCODE -ne 0) { throw "pm2 stop не вдався" }
    Start-Sleep -Seconds 3

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

    Step "Запуск ($apps)"
    pm2 restart $pm2Apps
    if ($LASTEXITCODE -ne 0) { throw "pm2 restart не вдався" }

    Step "Перевірка"
    Start-Sleep -Seconds 8
    $status = (Invoke-WebRequest -Uri "http://localhost:3010/login" -UseBasicParsing -TimeoutSec 20).StatusCode
    if ($status -ne 200) { throw "сайт відповів кодом $status" }
}
catch {
    Write-Host ""
    Write-Host "ПОМИЛКА під час оновлення: $_" -ForegroundColor Red
    Write-Host "Сайт і бот можуть бути ЗУПИНЕНІ. Після усунення причини продовжіть: powershell -ExecutionPolicy Bypass -File scripts\update.ps1 -Resume" -ForegroundColor Yellow
    Write-Host $restore -ForegroundColor Yellow
    Finish 1
}

Write-Host ""
Write-Host "Готово. Систему оновлено, сайт відповідає." -ForegroundColor Green
Write-Host "Бекап перед оновленням: $backup"
pm2 status
Finish 0
