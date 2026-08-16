# gamelog: check — линт; build — прод-сборка; drafts — с черновиками; serve — просмотр; deploy — на orion
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

.PHONY: check build drafts serve deploy
