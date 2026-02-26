.PHONY: build build-main build-renderer proto clean restart dev stop start

stop:
	@pkill -f "electron \." 2>/dev/null || true
	@sleep 0.5

proto:
	node scripts/copy-proto.js

build-main: proto
	npx tsc -p tsconfig.main.json

build-renderer:
	npx webpack --mode development

build: build-main build-renderer

clean:
	rm -rf dist

rebuild: clean build

start:
	npx electron . &

restart:
	$(MAKE) stop
	$(MAKE) build
	$(MAKE) start
	@echo "Client restarted"

dev:
	npx concurrently "npm run watch:main" "npm run watch:renderer" "wait-on dist/main/main.js && npx electron ."