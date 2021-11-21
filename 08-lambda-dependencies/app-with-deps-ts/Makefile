build-AppFunctionTs:
	npm ci
	npm run build
	rm -rf node_modules
	npm ci --production
	cp -R dist node_modules "$(ARTIFACTS_DIR)/"
