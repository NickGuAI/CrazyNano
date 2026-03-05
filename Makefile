.PHONY: run install api app clean

# Run both API and frontend
run:
	@rm -f .api_port
	@trap 'kill 0' EXIT; \
	(cd api && python server.py) & \
	while [ ! -f .api_port ]; do sleep 0.1; done && \
	echo "Opening http://localhost:3100" && \
	cd app && npm run dev

# Install all dependencies
install:
	cd api && pip install -r requirements.txt
	cd app && npm install

# Run API only
api:
	cd api && python server.py

# Run frontend only
app:
	cd app && npm run dev

# Clean
clean:
	rm -rf app/node_modules app/dist .api_port
	find . -type d -name __pycache__ -exec rm -rf {} +
