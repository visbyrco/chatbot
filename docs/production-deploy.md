# Production deploy notes

Live reference: `https://chat.visbyr.com` (Docker Compose project `chatbot`).
Use `docker-compose.prod.yml` for live servers. It fixes the drift that left
the old deployment publishing Redis on `0.0.0.0:6380` with no password (#217)
and Postgres on `0.0.0.0:5433` with a trivial password (#218).

## Compose layout

- Postgres and Redis publish no host ports. The app reaches them over the
  Compose network. The only host port is the app on `127.0.0.1:3001`,
  behind nginx/Apache TLS.
- If you need temporary DB admin access, add `127.0.0.1:5433:5432` for the
  session, then remove it. Never use `0.0.0.0` or `:::`, and never commit
  that change.
- `docker-compose.yml` is for local dev (loopback ports, optional Redis
  auth). `docker-compose.prod.yml` is for servers (no DB/Redis ports,
  required passwords, `shm_size` and CPU/memory guardrails).

## Credentials

- Required: `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `ENCRYPTION_KEY`.
  Generate the DB/Redis passwords with `openssl rand -hex 32` (hex has no
  URL-unsafe characters, so the passwords survive embedding in
  `POSTGRES_URL`/`REDIS_URL`; base64 `+`, `/`, `=` break URL parsing
  unless percent-encoded). `ENCRYPTION_KEY` uses `openssl rand -base64 32`.
- `POSTGRES_URL` is built from `POSTGRES_USER`/`POSTGRES_PASSWORD`/
  `POSTGRES_DB` in both compose files. `REDIS_URL` defaults to
  `redis://:<REDIS_PASSWORD>@redis:6379` in prod.
- The old `chatbot:chatbot` Postgres password and passwordless Redis must
  be treated as compromised: rotate both, then audit for unexpected keys
  and rows before going live.
- Postgres rotation: `docker compose -f docker-compose.prod.yml exec postgres
  psql -U chatbot -c "ALTER USER chatbot WITH PASSWORD '<new-hex>'"`,
  then update `POSTGRES_PASSWORD` and recreate the service.
- Redis rotation: `docker compose -f docker-compose.prod.yml exec redis
  redis-cli --user default --pass '<old>' CONFIG SET requirepass '<new-hex>'`,
  then update `REDIS_PASSWORD` and recreate the service so the
  command-line password matches. Audit with
  `REDISCLI_AUTH='<pw>' redis-cli --scan` and delete unexpected keys.
- Redis holds rate-limit counters and resumable-stream state. Anyone with
  write access can tamper with limits and availability, and `CONFIG SET` /
  `MODULE LOAD` paths are remote-code-execution risk, so auth is not
  optional.

## Firewall

Restrict the host so 3001/5433/6380 are not reachable off-host even if a
future compose change re-adds a port:

```bash
ufw default deny incoming
ufw allow 22,80,443/tcp
ufw enable
ss -tlnp | grep -E '3001|5433|6380'
```

Expect `127.0.0.1:3001` only. If you see `0.0.0.0:5433` or `0.0.0.0:6380`,
the deploy compose has drifted again.

## Postgres under host pressure (#221)

The 2026-09-21/22 logs showed `autovacuum worker took too long to start;
canceled` and a checkpoint that wrote 9 buffers in 71s. That is host I/O
and CPU starvation, not a bad query. The prod compose sets `shm_size: 256mb`
(the Docker default 64mb is too small for Postgres), CPU/memory
limits and reservations so a noisy neighbour cannot starve the DB, and
`log_checkpoints=on` plus `log_autovacuum_min_duration=1000` so pressure
shows up in logs early. Both compose files set `shm_size: 256MB`.

Watch for recurrence:

```bash
docker logs chatbot-postgres-1 2>&1 | grep -E 'autovacuum worker took too long|checkpoint complete' | tail -n 20
```

Alert on `autovacuum worker took too long to start` and on checkpoint
`total=` over about 10s. If it recurs, cap the heavy neighbours on the
host (the Minecraft and webui containers were the main load at the time)
or move Postgres off the shared host. Canceled autovacuum workers let dead
tuples pile up, so follow a starvation window with `VACUUM (ANALYZE)` on
the busy tables once load drops.
