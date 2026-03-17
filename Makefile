.PHONY: install build test start

drawio:
	git clone https://github.com/jgraph/drawio.git drawio

install: drawio
	npm install

build: install
	npm run build

test:
	npm test

start: build
	npm start
