PARALLEL   := perl -E 'wait for map { fork or exec $$_ } @ARGV'
GETVERSION := perl -MJSON -E 'say JSON::decode_json(join"",<>)->{info}{version}'

all: deps build

deps:
	go run build.go setup
	godep restore
	npm install

build:
	go run build.go build
	npm run build

plugins:
	( \
	    cd public_gen/plugins; \
		for plugin in *; do\
			if [ ! -e $$plugin/plugin.json ]; then continue; fi; \
		    version=$$($(GETVERSION) $$plugin/plugin.json); \
			tarball=$$plugin-$$version.tar.gz; \
	        tar -czf $$tarball $$plugin; \
		    echo $$PWD/$$tarball; \
	    done; \
	)

test:
	godep go test -v ./pkg/...
	npm test

run:
	$(PARALLEL) \
	    'grunt watch' \
	    './bin/grafana-server'
