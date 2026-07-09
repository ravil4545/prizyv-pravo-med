# SecondBrain RAG: безопасное включение

Прод-действия выполняются только после отдельного подтверждения владельца.

## Предварительные проверки

1. python scripts/audit_rag.py
2. python scripts/ingest_rag.py --dry-run
3. py -3.14 -m unittest scripts/test_ingest_rag.py
4. deno test --allow-env supabase/functions/_shared/medicalAdvice_test.ts supabase/functions/_shared/ragSearch_test.ts
5. npm.cmd run typecheck

## Порядок включения

1. Применить миграцию 20260709130000_rag_quality_pipeline.sql.
2. Проверить наличие rag_builds, rag_chunks_staging и новых колонок rag_chunks.
3. Проверить, что старые edge-функции продолжают искать через hybrid_rag_chunks с параметрами по умолчанию.
4. Запустить полную staging-сборку: python scripts/ingest_rag.py.
5. Проверить: python scripts/audit_rag.py --compare-prod.
6. Задеплоить функции:
   - analyze-medical-document
   - chat
   - chat-rag
   - questionnaire-analyze
   - lawyer-case-assistant
   - lawyer-build-plan
7. Запустить: python scripts/eval_rag.py --task retrieval.query --match-count 8.
8. Анонимным ключом проверить, что прямой SELECT из rag_chunks и rag_system_context запрещён.
9. Выполнить smoke-тесты чата, анализа документа и опросника.

## Важный блокер текущего проекта

Команда supabase db push --dry-run --linked сейчас останавливается из-за старого расхождения истории миграций: в удалённой таблице истории есть версии, отсутствующие в локальном репозитории. Не выполнять автоматически migration repair, db pull или include-all.

До отдельного согласования истории quality-миграцию следует применять контролируемо как один SQL-блок через разрешённый миграционный канал, затем отдельно проверять созданные объекты. Это не повод изменять или помечать откатанными старые удалённые миграции.

## Откат

- До атомарной публикации активная rag_chunks не меняется.
- При ошибке staging-сборка получает статус failed, старая активная база остаётся рабочей.
- Edge-функции разворачиваются отдельно и могут быть возвращены на предыдущую версию без изменения канонического волта.
