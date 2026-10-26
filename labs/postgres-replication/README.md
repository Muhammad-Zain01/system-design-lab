# PostgreSQL Replication

A small TODO application that writes to a primary PostgreSQL database and reads
from a physical streaming replica. The purpose is to see how a successful write
becomes visible through a separate read connection.

## Architecture

```text
Browser → Node.js TODO app (port 3000)
              ├── POST / PATCH / DELETE → primary (port 15432)
              └── GET /api/todos        → replica (port 15433)

Primary → write-ahead log (WAL) → replica replays changes
```

The app creates the `todos` table on the primary. The replica starts from a
`pg_basebackup` and follows the primary's WAL stream. Schema changes and rows
are replicated; the app does not manually copy TODOs between databases.

Streaming is asynchronous: a write response can arrive before the replica has
replayed the change. The browser retries reads briefly to make that delay visible.
The replica is read-only until explicitly promoted; this lab does not automate
promotion or failover.

## Files

```text
compose.yml       Primary, replica, persistent volumes, replication settings
server.js         HTTP API, primary writes, replica reads
public/index.html TODO interface and polling for changes
package.json      Node.js dependency and start command
yarn.lock         Dependency versions
.env.example      Local ports and database connection settings
```

## Run

From this directory, with Docker running and Node.js 20+ installed:

```sh
docker compose up -d --wait
cp .env.example .env  # First setup only; do not overwrite custom settings.
yarn install --frozen-lockfile
yarn start
```

Open [the TODO app](http://127.0.0.1:3000). If Yarn is unavailable, `npm install`
and `npm start` also run the app; Yarn uses the included lockfile.

The single `compose.yml` uses PostgreSQL 16 Alpine and sets up replication.
Local connections use user `replicator`, password `local-dev-only`, database
`ecommerce`, and ports 15432/15433. The service names are `primary` and `replica`.
Existing `.env` overrides must match these settings.

The Compose project name remains `postgres-replication-lab`, keeping its existing
named volume identities after the folder rename. Volumes from the removed
independent-database experiment are separate and are not automatically migrated.
Previously initialized volumes retain their database credentials.

## Inspect replication

Confirm which server is in recovery:

```sh
docker compose exec primary psql -U replicator -d ecommerce -c 'SELECT pg_is_in_recovery();'
docker compose exec replica psql -U replicator -d ecommerce -c 'SELECT pg_is_in_recovery();'
```

Expect `false` on the primary and `true` on the replica. On the primary, inspect
the streaming connection:

```sh
docker compose exec primary psql -U replicator -d ecommerce -c 'SELECT application_name, state, sync_state, replay_lsn FROM pg_stat_replication;'
```

To observe lag, pause replay on the replica:

```sh
docker compose exec replica psql -U replicator -d ecommerce -c 'SELECT pg_wal_replay_pause();'
```

Add a TODO in the browser. The write succeeds on the primary, but the list stays
behind until replay resumes:

```sh
docker compose exec replica psql -U replicator -d ecommerce -c 'SELECT pg_wal_replay_resume();'
```

Refresh the list to see the new row. This separates accepting a write from making
it visible on a replica. WAL records changes the standby can replay; it is not
an application event log or an exported text file we need to keep in the repo.

## Stop

```sh
docker compose down
```

This retains database volumes. For an intentional fresh start, `docker compose
down -v` deletes this Compose project's primary and replica data. Keep the two
volumes together: a replica's existing data directory belongs to the primary
cluster it was cloned from.

The current setup is local and resource-limited. It has no failover coordinator,
automatic recovery from an outdated replica, or guarantee that every successful
write is already visible on the replica.
