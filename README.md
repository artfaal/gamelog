# gamelog — «Хроника»

Игровой дневник Макса: https://games.artfaal.ru — одностраничная лента
пройденных игр с впечатлениями, кадрами, видео и wallpaper'ами на весь экран.
Статика собирается из markdown-файлов своим генератором (~250 строк node).

## Как это устроено

```
content/<slug>.md   ← записи, 100% рукописные (текст + YAML frontmatter)
content/media/      ← свои кадры и клипы (webm/mp4 в git не попадают)
cache/<appid>.json  ← машинная Steam-мета; пишет new.mjs, руками не трогать
scripts/new.mjs     ← добавить игру: кэш + заготовка записи
scripts/build.mjs   ← сборка dist/ (лента + OG-стабы /e/<slug>/)
site/               ← styles.css и app.js, копируются в dist как есть
```

Слаг файла — универсальный ключ записи и её якорь: `content/hades.md` →
`games.artfaal.ru/#hades` и OG-ссылка `games.artfaal.ru/e/hades/`
(карточка игры в телеграме, редирект в ленту).

## Добавить запись

```bash
node scripts/new.mjs 1145360            # appid из URL страницы игры в Steam
# → cache/1145360.json + content/hades.md (заготовка, draft: true)
```

Дальше — руками в `content/hades.md`:

```yaml
---
steam: 1145360          # опционально: без него медиа задаётся руками (см. не-Steam)
finished: 2026-07-12    # дата прохождения/дропа
hours: 41
score: 9                # 1–10; у дропа score нет — вместо него dropped: true
verdict: Одна строка — вердикт крупным шрифтом.
shots: [0, 1]           # кадры записи: номера магазинных скринов или media/файлы
clip: store             # store (микротрейлер) | media/my.webm | none
platform: switch        # опционально, пометка для не-Steam платформ
draft: true             # убрать перед публикацией
---
Текст впечатления. Обычный markdown. ||Это спойлер — блюр до клика.||

## Моменты
### Название момента
![Подпись кадра](2)
Текст к конкретному кадру. Ссылка в картинке — номер магазинного скрина
или путь media/my.jpg.

### Финал {spoiler}
![Финальный кадр](4)
Момент целиком заблюрен до клика «спойлер — показать».
```

Проверить и опубликовать:

```bash
make serve     # локально с драфтами: http://localhost:8480
make deploy    # прод-сборка (без драфтов) + rsync на orion
```

Сборка валидирует контент: кривая дата, отсутствующий score без `dropped: true`,
несуществующий номер скрина — прод-сборка падает с именем файла (драфт с
ошибками просто пропускается с предупреждением). Пустая прод-сборка не деплоится.

## Возвращения к игре

Один файл = один заход. Второй заход — второй файл с тем же `steam:`
(для не-Steam — одинаковое поле `game:`): `atomic-heart-2024.md` (дроп) +
`atomic-heart.md` (прошёл). Связки «дропнул в 2024 ↗ / вернулся и прошёл ↗»
генератор строит сам.

## Не-Steam игры (Switch, PSN…)

`steam:` не указывается, минимум — своя обложка:

```yaml
name: The Legend of Zelda — Tears of the Kingdom
hero: media/zelda-hero.jpg    # обязательна (широкий арт)
logo: media/zelda-logo.png    # нет — имя рисуется текстом
poster: media/zelda-poster.jpg # нет — в оглавлении кроп hero
platform: switch
```

Мультиплатформа, которая есть в Steam, оформляется через `steam:` — даже если
играл не там.

## Инфраструктура

- Хостинг: orion, `/var/docker/compose/gamelog/` (nginx + caddy-label) —
  → INFRA-DOCS `servers/orion.md`
- DNS: A-запись `games` в Cloudflare (скилл cloudflare-dns)
- Деплой: `make deploy` (сборка + rsync), CI нет намеренно

## История дизайна

Дизайн — вариант I «Свиток», победитель пяти итераций прототипа
(A…J, ветка `prototype`, живой архив: https://pub.artfaal.ru/gamelog-proto/).

Бэклог: SteamGridDB для артов эксклюзивов · Steam Web API (часы автоматом) ·
RSS по первому запросу.
