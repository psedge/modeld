.PHONY: install build test ci start

drawio:
	git clone https://github.com/jgraph/drawio.git drawio

install: drawio
	npm install

build: install
	npm run build

test:
	npm test

ci:
	act push --job test --container-architecture linux/amd64

start: build
	npm start
