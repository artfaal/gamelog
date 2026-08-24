# gamelog: check — линт; test — проверки связок и разбора кадров; build — прод-сборка; drafts — черновики; serve — просмотр;
# deploy — на orion; guards — сторожа собранного; ab — два варианта рядом; hours — сверка часов со Steam; suggest — кандидаты в дневник;
# timeline — когда играл, по ачивкам;
# video/image — проверка клипов и кадров по политике;
# refresh — что разошлось со Steam
DEPLOY_DEST ?= orion.artfaal.ru:/var/docker/compose/gamelog/data/

check:
	npm run lint

# проверки тонких мест, которых нет в живом контенте: подписи связок между заходами
# и разбор размеров картинки. Всё остальное проверяет сборка на реальных записях
test:
	@node --test scripts/test.mjs

build: check
	node scripts/build.mjs

drafts: check
	node scripts/build.mjs --drafts
	@$(MAKE) --no-print-directory guards

serve: drafts
	@echo "http://localhost:8480"
	@cd dist && python3 -m http.server 8480 --bind 127.0.0.1

# сторожа от регресса над собранным dist/. Стоят на пути ПРЕДЪЯВЛЕНИЯ (drafts/serve),
# а не только перед rsync: результат смотрится через make serve, и дефект должен
# ловиться до показа, а не при деплое. Третий сторож: класс-модификатор, который
# build.mjs вешает литералом (storelink--*), обязан иметь правило в styles.css —
# иначе плашка молча теряет вид (разбор 21 августа 2026)
guards:
	@! grep -q ' poster="' dist/index.html || { echo "✗ в разметке снова poster= у <video>: кадры-заглушки качаются на первом экране (нужен data-poster)"; exit 1; }
	@! grep -q 'loading="eager"' dist/index.html || { echo "✗ в разметке обои с loading=\"eager\": 39 МБ артов уедут на первый экран (пробуждение живёт в site/app.js)"; exit 1; }
	@for m in $$(grep -o 'storelink--[a-z0-9-]*' scripts/build.mjs | sort -u); do \
	  grep -q "\.$$m" site/styles.css || { echo "✗ $$m объявлен в build.mjs, а правила в styles.css нет"; exit 1; }; \
	done

deploy: build guards
	rsync -az --delete dist/ $(DEPLOY_DEST)

# сравнение двух вариантов вёрстки — только на двух реально собранных сборках рядом:
# подмена стиля в открытой вкладке меряет прогретую раскладку и даёт ложное совпадение
# (разбор 19 августа 2026). BEFORE — коммит базы, текущее дерево собирается как есть.
# node_modules и cache/assets базы — симлинки на текущие. Кеш браузера выключай
# (devtools → Disable cache), иначе сравниваешь не сборки, а кеш
ab: drafts
	@test -n "$(BEFORE)" || { echo "нужен коммит базы: make ab BEFORE=abc123"; exit 1; }
	@git worktree remove --force .ab-base 2>/dev/null || true
	@git worktree add --detach .ab-base $(BEFORE)
	@ln -s ../node_modules .ab-base/node_modules
	@mkdir -p .ab-base/cache && ln -s ../../cache/assets .ab-base/cache/assets
	@for f in content/media/*.mp4 content/media/*.webm; do \
	  test -e "$$f" && ln -sf "$$(pwd)/$$f" ".ab-base/$$f"; done; true
	@cd .ab-base && node scripts/build.mjs --drafts
	@echo "база $(BEFORE): http://localhost:8481 · текущая: http://localhost:8480"
	@python3 -m http.server 8481 --bind 127.0.0.1 -d .ab-base/dist & P=$$!; \
	  trap 'kill $$P 2>/dev/null' EXIT; \
	  python3 -m http.server 8480 --bind 127.0.0.1 -d dist

# клипы: video — отчёт по политике качества, video-fix — ещё и faststart без пережатия
video:
	@node scripts/video.mjs

video-fix:
	@node scripts/video.mjs --fix

# кадры: та же идея, что у клипов — отчёт с готовой командой пережатия.
# --fix нет: у картинок правки без потери качества не выходит, см. шапку image.mjs
image:
	@node scripts/image.mjs

# сверка часов со Steam: креды берём из канона game-compass, скрипт только читает
hours:
	@set -a; . ~/.skill-secrets/game-compass.env; set +a; node scripts/hours.mjs

# кандидаты в дневник: наиграно в Steam, а записи нет. Тоже только читает
suggest:
	@set -a; . ~/.skill-secrets/game-compass.env; set +a; node scripts/suggest.mjs

# когда играл и до чего дошёл — по датам ачивок. Тоже только читает
timeline:
	@test -n "$(APPID)" || { echo "нужен appid: make timeline APPID=1245620"; exit 1; }
	@set -a; . ~/.skill-secrets/game-compass.env; set +a; node scripts/timeline.mjs $(APPID)

# что разошлось со Steam по всем кэшам; ничего не пишет.
# Точечная запись поля — прямым вызовом: node scripts/refresh.mjs <appid> --field genres
refresh:
	@node scripts/refresh.mjs --all

.PHONY: check test build drafts serve deploy guards ab hours suggest timeline video video-fix image refresh
