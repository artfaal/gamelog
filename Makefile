# gamelog: build — прод-сборка; drafts — с черновиками; serve — локальный просмотр; deploy — на orion
DEPLOY_DEST ?= orion.artfaal.ru:/var/docker/compose/gamelog/data/

build:
	node scripts/build.mjs

drafts:
	node scripts/build.mjs --drafts

serve: drafts
	@echo "http://localhost:8480"
	@cd dist && python3 -m http.server 8480

deploy: build
	rsync -az --delete dist/ $(DEPLOY_DEST)

.PHONY: build drafts serve deploy
