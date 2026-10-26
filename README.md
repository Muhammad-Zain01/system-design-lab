# System Design Lab

Three small, runnable labs for understanding how data is stored, routed, read,
and kept consistent. Each lab has its own README with the architecture,
commands, and experiments that explain its behavior.

## Labs

| Lab | What is built | What to understand |
| --- | --- | --- |
| [Simple Kafka](labs/simple-kafka/README.md) | A Node.js event log with two JSONL partitions, keyed production, polling consumers, and persisted commits. | Ordering, partition routing, replay, and consumer progress. |
| [PostgreSQL replication](labs/postgres-replication/README.md) | A TODO app with writes on a primary and reads on a physical streaming replica. | WAL, read/write separation, replication lag, and eventual visibility. |
| [E-commerce](labs/ecommerce/README.md) | A TypeScript API with products, transactional orders, inventory reservation, and a k6 load script. | Transactions, concurrent stock updates, idempotency, and capacity experiments. |

## Layout

```text
system-design-lab/
├── README.md
└── labs/
    ├── simple-kafka/
    ├── postgres-replication/
    └── ecommerce/
```

`labs/` describes these learning exercises. Source files and commands live near
one another; there are no placeholder folders for future projects. Application
settings, dependencies, compiled output, and Kafka data are ignored by Git.

## Start here

Use Node.js 20 or newer. The database labs also need Docker Engine and Docker
Compose. Run the commands from the lab directory indicated below.

**Simple Kafka** — two terminals in `labs/simple-kafka`:

```sh
node start-consumer.mjs
# In the second terminal:
node demo.mjs
```

**PostgreSQL replication** — in `labs/postgres-replication`:

```sh
docker compose up -d --wait
cp .env.example .env  # First setup only; keep existing custom settings.
yarn install --frozen-lockfile
yarn start
```

**E-commerce** — in `labs/ecommerce`:

```sh
cp .env.example .env  # First setup only.
docker compose up -d --wait
npm ci
npm run dev
```

Both web apps default to port 3000; run one at a time or set `PORT=3001` for one
of them. E-commerce PostgreSQL uses port 5432. The replication lab uses 15432
(primary) and 15433 (replica), so their database ports do not overlap.

For each experiment: predict the behavior, run it, inspect the data or logs,
and explain what happened. These implementations are learning exercises;
the lab READMEs distinguish implemented behavior from features left out.
