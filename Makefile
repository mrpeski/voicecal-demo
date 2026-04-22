# Makefile for VoiceCal demo

# Backend commands
.PHONY: backend-install
backend-install:
	@echo "Installing backend dependencies..."
	cd backend && uv sync

.PHONY: backend-run
backend-run:
	@echo "Running backend..."
	cd backend/src && uv run uvicorn voicecal.app:app --reload --port 8000

.PHONY: backend-test
backend-test:
	@echo "Running backend tests..."
	cd backend && uv run pytest

.PHONY: backend-format
backend-format:
	@echo "Formatting backend code..."
	cd backend && uv run ruff format .

.PHONY: backend-lint
backend-lint:
	@echo "Linting backend code..."
	cd backend && uv run ruff check .

# Frontend commands
.PHONY: frontend-install
frontend-install:
	@echo "Installing frontend dependencies..."
	cd frontend && pnpm install

.PHONY: frontend-dev
frontend-dev:
	@echo "Starting frontend development server..."
	cd frontend && pnpm dev

# Full dev (both backend & frontend)
.PHONY: dev
# Install both sides then run them in parallel (user may open separate terminals)
install:
	$(MAKE) backend-install frontend-install

dev: install
	@echo "Starting both backend and frontend (parallel)..."
	$(MAKE) -j2 backend-run frontend-dev

# Eval runner
.PHONY: eval
eval:
	@echo "Running evals..."
	cd backend && uv run python -m voicecal.eval

# Clean up caches and generated files
.PHONY: clean
clean:
	@echo "Cleaning Python caches and node_modules..."
	rm -rf backend/__pycache__ backend/.venv
	rm -rf frontend/node_modules
