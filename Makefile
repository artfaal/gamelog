# gamelog: check — линт; build — прод-сборка; drafts — черновики; serve — просмотр;
# deploy — на orion; hours — сверка часов со Steam; video — проверка клипов
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

deploy: build
	rsync -az --delete dist/ $(DEPLOY_DEST)

# клипы: video — отчёт по политике качества, video-fix — ещё и faststart без пережатия
video:
	@node scripts/video.mjs

video-fix:
	@node scripts/video.mjs --fix

# сверка часов со Steam: креды берём из канона game-compass, скрипт только читает
hours:
	@set -a; . ~/.skill-secrets/game-compass.env; set +a; node scripts/hours.mjs

.PHONY: check build drafts serve deploy hours video video-fix
