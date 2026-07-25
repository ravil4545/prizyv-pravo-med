# =====================================================================
#  Ежедневная резервная копия локального Supabase.
#
#  В облаке бэкапы делает Supabase. На своей машине их не делает НИКТО —
#  это главная перемена при переезде, о которой проще всего забыть.
#
#  Задача в Планировщике (запустить один раз, от администратора):
#    schtasks /create /tn "nepriziv-backup" /sc daily /st 04:00 ^
#      /tr "powershell -NoProfile -ExecutionPolicy Bypass -File E:\supabase-project\backup.ps1"
#
#  ВНИМАНИЕ: файл должен быть сохранён в UTF-8 С BOM, иначе PowerShell
#  прочитает русские строки как CP1251 и выведет кракозябры.
# =====================================================================

$ErrorActionPreference = 'Stop'

$ProjectDir = 'E:\supabase-project'
$BackupRoot = 'E:\backups'
$KeepDays   = 14
$Stamp      = Get-Date -Format 'yyyy-MM-dd_HHmm'
$Dst        = Join-Path $BackupRoot $Stamp

function Write-Log([string]$Message) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $Message"
    Write-Host $line
    Add-Content -Path (Join-Path $BackupRoot 'backup.log') -Value $line -Encoding UTF8
}

New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
New-Item -ItemType Directory -Force -Path $Dst | Out-Null

try {
    # --- База -----------------------------------------------------------
    # Формат -Fc (custom): сжат и позволяет частичное восстановление
    # через pg_restore. Простой .sql пришлось бы катить целиком.
    Write-Log 'Дамп базы...'
    docker exec supabase-db pg_dump -U postgres -Fc postgres |
        Set-Content -Path (Join-Path $Dst 'db.dump') -Encoding Byte
    if ($LASTEXITCODE -ne 0) { throw "pg_dump вернул код $LASTEXITCODE" }

    $dbSize = (Get-Item (Join-Path $Dst 'db.dump')).Length
    # Пустой дамп — типичный признак того, что контейнер не поднят.
    # Без этой проверки в папке лежал бы файл на 0 байт, и обнаружилось бы
    # это ровно в тот момент, когда бэкап понадобится.
    if ($dbSize -lt 100KB) { throw "дамп подозрительно мал ($dbSize байт) — контейнер supabase-db запущен?" }
    Write-Log "  база: $([math]::Round($dbSize/1MB,1)) МБ"

    # --- Файлы Storage ---------------------------------------------------
    Write-Log 'Архив файлов Storage...'
    $storage = Join-Path $ProjectDir 'volumes\storage'
    if (Test-Path $storage) {
        Compress-Archive -Path "$storage\*" -DestinationPath (Join-Path $Dst 'storage.zip') -Force
        Write-Log "  storage: $([math]::Round((Get-Item (Join-Path $Dst 'storage.zip')).Length/1MB,1)) МБ"
    } else {
        Write-Log '  ВНИМАНИЕ: папка storage не найдена'
    }

    # --- Секреты ---------------------------------------------------------
    # .env содержит пароль БД и JWT-ключи: без него дамп бесполезен —
    # восстановить базу можно, а войти в неё нечем.
    Copy-Item (Join-Path $ProjectDir '.env') (Join-Path $Dst 'env.backup')

    # --- Второй мозг и смежные проекты ------------------------------------
    # У волта SecondBrain, hermes-tools и social-autoposting нет ни одного
    # внешнего бэкапа (вывод аудита). Раз уж заводим копирование — забираем.
    foreach ($extra in @(
        @{ Path = 'D:\Obsidian\SecondBrain';                   Name = 'secondbrain.zip' },
        @{ Path = 'C:\Users\Ravil\hermes-tools';               Name = 'hermes-tools.zip' },
        @{ Path = 'C:\nepriziv Claude project\social-autoposting'; Name = 'social-autoposting.zip' }
    )) {
        if (Test-Path $extra.Path) {
            Compress-Archive -Path "$($extra.Path)\*" -DestinationPath (Join-Path $Dst $extra.Name) -Force
            Write-Log "  $($extra.Name): готов"
        }
    }

    # --- Ротация ---------------------------------------------------------
    Get-ChildItem $BackupRoot -Directory |
        Where-Object { $_.CreationTime -lt (Get-Date).AddDays(-$KeepDays) } |
        ForEach-Object { Write-Log "  удаляю старую копию $($_.Name)"; Remove-Item $_.FullName -Recurse -Force }

    Write-Log "Готово: $Dst"

    # НАПОМИНАНИЕ. Копия лежит на том же диске, что и данные, — то есть
    # точка отказа общая. Настройте выгрузку наружу (rclone в Яндекс.Диск
    # или S3, либо второй компьютер через Tailscale) и раз в квартал
    # проверяйте восстановление: непроверенный бэкап бэкапом не является.
}
catch {
    Write-Log "ОШИБКА: $_"
    # Ненулевой код — чтобы Планировщик пометил задачу как упавшую и это
    # было видно, а не считалось успехом.
    exit 1
}
