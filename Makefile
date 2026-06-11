.PHONY: install build test lint check demo clean

install:
	npm install

build:
	npm run build

test:
	npm test

lint:
	npm run lint

check:
	npm run check

demo: build
	node dist/cli.js scan test/fixtures/demo-app

clean:
	rm -rf dist coverage
