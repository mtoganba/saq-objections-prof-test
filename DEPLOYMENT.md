# Публикация

Основной сайт: https://saq-objections-test.vercel.app/

GitHub: https://github.com/ewgftju/ewgftju-saq-objections-test

Основной проект Vercel: `saq-objections-test` (`prj_gVpMj61RcfyIYdtcO6SW1MRlUFns`), команда `airom-cup`.

На 09.09.2026 GitHub-репозиторий подключён к основному проекту и к дополнительному проекту `frontend`. Ветка публикации — `main`.

## Настройки сборки

| Root Directory | Конфигурация | Install Command | Build Command | Output Directory |
|---|---|---|---|---|
| Корень репозитория | `vercel.json` | `npm --prefix frontend ci --no-audit --no-fund` | `npm run build` | `frontend/dist` |
| `frontend` | `frontend/vercel.json` | `npm ci --no-audit --no-fund` | `npm run build` | `dist` |

Команды в каждой конфигурации выполняются относительно выбранного Root Directory. Для `frontend` нельзя повторно добавлять `--prefix frontend`: это направляет установку в несуществующую вложенную папку `frontend/frontend`.

Файл `frontend/package-lock.json` хранится в Git и используется для воспроизводимой установки через `npm ci`. Обе конфигурации включают маршрутизацию SPA для прямых ссылок на карточки дел.

Настройки Git основного проекта: https://vercel.com/airom-cup/saq-objections-test/settings/git.
