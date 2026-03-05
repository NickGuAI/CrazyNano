.PHONY: run install dev api clean

# Run both API server and frontend (main command)
run:
	@echo "Starting NanoCrazer..."
	@rm -f ../.api_port
	@trap 'kill 0' EXIT; \
	(cd ../api && python server.py) & \
	sleep 2 && \
	npm run dev

# Install all dependencies (frontend + backend)
install:
	cd ../api && pip install -r requirements.txt
	npm install

# Run frontend only (requires API already running)
dev:
	npm run dev

# Run API server only
api:
	cd ../api && python server.py

# Build for production
build:
	npm run build

# Clean build artifacts
clean:
	rm -rf node_modules dist ../.api_port
	find .. -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
