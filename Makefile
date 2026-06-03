.PHONY: dev build test migrate seed lint install-hooks clean

COMPOSE := docker compose
BACKEND_DIR := backend
FRONTEND_DIR := frontend

dev:
	@bash scripts/dev.sh

build:
	$(COMPOSE) build

test:
	@bash scripts/test.sh

migrate:
	@bash scripts/migrate.sh

seed:
	@bash scripts/seed.sh

lint:
	cd $(BACKEND_DIR) && ruff check app tests && black --check app tests
	cd $(FRONTEND_DIR) && npm run lint

install-hooks:
	pip install pre-commit
	pre-commit install

clean:
	$(COMPOSE) down -v --remove-orphans
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	rm -rf frontend/dist frontend/node_modules/.vite 2>/dev/null || true

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f
