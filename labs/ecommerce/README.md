# E-commerce

A small TypeScript API backed by PostgreSQL. It demonstrates the baseline for
scaling experiments: product reads, transactional inventory reservation, and
order retries that do not reserve stock twice.

## Architecture

```text
Client or k6 → Fastify API → PostgreSQL
                   ├── list products
                   ├── create and read orders
                   └── check process and database health
```

Order creation inserts a pending order, conditionally decreases available stock,
and confirms the order inside one transaction. If stock is insufficient, the
transaction rolls back. The conditional stock update prevents stock from going
below zero when requests compete for the same product.

An `idempotency-key` identifies an order attempt. Repeating the same request with
the same key returns the existing order; reusing the key with different inputs
returns a conflict. Each JSON response includes `serverId`, which helps identify
API instances when comparing deployments.

## Files

```text
src/server.ts          API routes, transactions, and database connection
package.json           Development, build, and start commands
package-lock.json      Reproducible npm dependency versions
tsconfig.json          TypeScript compiler settings
compose.yml            Local PostgreSQL with persistent storage
db/init.sql            Product/order schema and three seeded products
Dockerfile             API build and runtime image
load-tests/products.js k6 product-read workload and per-instance metrics
.env.example           Local API and database settings
```

## Run locally

From this directory, with Node.js 20+ and Docker installed:

```sh
cp .env.example .env  # First setup only; keep any existing custom settings.
docker compose up -d --wait
npm ci
npm run dev
```

The API listens on port 3000 and PostgreSQL on 5432. The database initialization
script runs when the database volume is first initialized. Change `PORT` if the
PostgreSQL TODO app is already using port 3000.

## Try the behavior

```sh
curl 'http://localhost:3000/products?limit=50&offset=0'
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
```

Create an order using a seeded product:

```sh
curl -X POST http://localhost:3000/orders \
  -H 'content-type: application/json' \
  -H 'idempotency-key: order-attempt-001' \
  -d '{"productId":"11111111-1111-4111-8111-111111111111","quantity":1}'
```

Repeat the request to observe `idempotentReplay: true`; the stock is not reserved
again. Change the quantity while keeping the key to see a conflict. Use the
returned order ID with `GET /orders/:id`.

| Endpoint | Behavior |
| --- | --- |
| `GET /products` | Paginated products; `limit` defaults to 50, maximum 100. |
| `POST /orders` | Reserve inventory and confirm an order transactionally. |
| `GET /orders/:id` | Fetch an existing order. |
| `GET /health/live` | Check that the application process responds. |
| `GET /health/ready` | Check that the database responds. |

## Build and load experiments

```sh
npm run build
npm start
```

To build the API container from this directory:

```sh
docker build -t ecommerce-api:0.1.2 .
```

The image contains the compiled API and production dependencies. PostgreSQL runs
separately; set `DATABASE_URL` when running the API container. Within the Compose
network, the database hostname is `postgres`, not `localhost`.

With k6 installed and the API running:

```sh
k6 run load-tests/products.js
```

The workload ramps from 10 to 200 virtual users and defaults to localhost and
one catalog page, matching the three seeded products. For an existing deployment
or a larger dataset, set `BASE_URL` and `TOTAL_PAGES` explicitly:

```sh
k6 run -e BASE_URL=http://localhost:3000 -e TOTAL_PAGES=1 load-tests/products.js
```

Set `SERVER_ID=api-1` or `SERVER_ID=api-2` on API processes to attribute load-test
requests to each instance. The script measures latency and request counts; the
repository does not contain a load balancer or a reproducible multi-server
provisioning setup, and it does not claim benchmark results.

## Stop

```sh
docker compose down
```

This retains local database data. To deliberately reset it, `docker compose
down -v` removes this lab's database volume; the next start recreates the schema
and seed data. Replication, caching, and service extraction are not implemented
in this API.
