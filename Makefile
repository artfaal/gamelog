# gamelog: check — линт; build — прод-сборка; drafts — черновики; serve — просмотр;
# deploy — на orion; hours — сверка часов со Steam; suggest — кандидаты в дневник;
# timeline — когда играл, по ачивкам;
# video/image — проверка клипов и кадров по политике; refresh — что разошлось со Steam
DEPLOY_DEST ?= orion.artfaal.ru:/var/docker/compose/gamelog/data/

check:
	npm run lint

build: check
	node scripts/build.mjs

drafts: check
	node scripts/build.mjs --drafts

serve: drafts
	@echo "http://localhost:8480"
	@cd dist && python3 -m http.server 8480 --bind 127.0.0.1

# сторож от регресса: жадный poster= у <video> возвращается молча при любой правке
# build.mjs и стоит мегабайты на первом экране. Проверяем собранное до rsync — дефект
# ловится раньше, чем уезжает к читателю, и без похода в сеть
deploy: build
	@! grep -q ' poster="' dist/index.html || { echo "✗ в разметке снова poster= у <video>: кадры-заглушки качаются на первом экране (нужен data-poster)"; exit 1; }
	rsync -az --delete dist/ $(DEPLOY_DEST)

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

.PHONY: check build drafts serve deploy hours suggest timeline video video-fix image refresh
