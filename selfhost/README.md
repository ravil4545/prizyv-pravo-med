# selfhost — материалы для переезда на свой сервер

Заготовки к плану `nepriziv_selfhost_plan_2026-07-25.md`. Здесь лежит то, что можно положить на место и запустить, а не набирать заново.

## Что в папке

| Файл | Куда | Зачем |
|---|---|---|
| `migrate-storage.mjs` | запускается из корня репозитория | Перенос файлов Storage из облака в локальный стек |
| `migrate.secrets.example.env` | скопировать в `migrate.secrets.env` | Ключи для переноса (в `.gitignore`) |
| `env.selfhost.example` | дописать в `E:\supabase-project\.env` | То, чего не знают скрипты генерации ключей |
| `Caddyfile` | `E:\web\Caddyfile` | Раздача собранного фронта на `:8080` |
| `cloudflared-config.example.yml` | `C:\Users\Ravil\.cloudflared\config.yml` | Туннель наружу без открытия портов |
| `backup.ps1` | `E:\supabase-project\backup.ps1` | Ежедневная копия базы, файлов и волта |

## Порядок

Полный чек-лист по дням — в плане. Здесь только то, что касается этих файлов.

**1. Перенос файлов Storage** (после того как стек поднят и база залита)

```powershell
copy selfhost\migrate.secrets.example.env selfhost\migrate.secrets.env
# заполнить ключи, затем:
node selfhost\migrate-storage.mjs --dry-run   # посмотреть план, ничего не менять
node selfhost\migrate-storage.mjs             # перенести
node selfhost\migrate-storage.mjs --verify    # сверить
```

Скрипт идемпотентен: повторный запуск дозаливает недостающее. Прерванный перенос просто запускается снова.

**2. Фронтенд**

Адрес и ключ Supabase теперь читаются из `.env` — в коде их нет (за это отвечает `tests/supabaseConfig_test.ts`). Достаточно правки трёх строк:

```ini
VITE_SUPABASE_URL=https://api.nepriziv.ru
VITE_SUPABASE_PUBLISHABLE_KEY=<SUPABASE_PUBLISHABLE_KEY из .env стека>
VITE_SUPABASE_PROJECT_ID=local
```

Затем `npm ci && npm run build`, содержимое `dist/` — в `E:\web\dist`.

Пре-рендер на этапе сборки ходит в базу за диагнозами и блогом, поэтому стек должен быть уже запущен и наполнен. Если он недоступен, сборка не упадёт, но в консоли будет предупреждение и около сотни SEO-страниц соберутся без своих `<head>`.

**3. Туннель**

Шаг, который легко упустить: Cloudflare Tunnel требует, чтобы домен обслуживался DNS Cloudflare. Сейчас `nepriziv.ru` на `ns1-ns4.sprinthost.ru` — NS меняются у регистратора Sprintnames, регистратор при этом остаётся прежним.

**4. Бэкапы**

```powershell
schtasks /create /tn "nepriziv-backup" /sc daily /st 04:00 ^
  /tr "powershell -NoProfile -ExecutionPolicy Bypass -File E:\supabase-project\backup.ps1"
```

Скрипт падает с ненулевым кодом, если дамп получился подозрительно мал — типичный признак того, что контейнер базы не запущен. Без такой проверки в папке лежал бы файл на ноль байт, и выяснилось бы это ровно тогда, когда копия понадобится.

Копия ложится на тот же диск, что и данные. Это не резервное копирование, пока она оттуда не уезжает — настройте выгрузку (rclone в Яндекс.Диск или S3, либо второй компьютер через Tailscale).

## Чего здесь нет

Дампа базы: строка подключения к облаку берётся в дашборде и в репозиторий не кладётся. Команды — в §5.2 плана.

## Откат

Облачный проект `kqbetheonxiclwgyatnm` — это откат. Возврат = три строки в `.env` и пересборка. Не удаляйте его как минимум месяц после переезда.
