# Avalon Core: turning Avalon into the server's web OS

Status: plan, nothing built yet. Written for the owner and for Claude Code running on the server.
Server: Ubuntu, SSH only, nothing else installed.

## 1. The idea

Avalon today is a set of static pages (Home, Search, Research, Treasury) that keep their data in the
browser. To manage the server it needs a part that runs **on** the server:

```
Browser: Avalon pages  ⇄  Avalon Core (Node.js, in a container)  ⇄  Docker Engine · /proc · /sys · disks
                               │
                               └─ SQLite: users, sessions, app data, audit log
```

Avalon Core:

- serves the Avalon pages (one origin, so every app shares storage and SearXNG can live beside it)
- logs you in (the lock screen becomes a real login)
- manages Docker: containers, images, Compose stacks, logs, stats, updates
- streams server resources: CPU, memory, disks, network, temperatures, uptime
- keeps the apps' data on the server, so phone and PC see the same books and investigations
- runs Sentinel's health checks server-side

Every existing app keeps working from `file://` exactly as now. Server features appear only when the
page is served by Core and you are logged in.

## 2. Server baseline (one time, over SSH)

1. Updates and automatic security updates
   ```bash
   sudo apt update && sudo apt full-upgrade -y
   sudo apt install -y unattended-upgrades git curl
   sudo dpkg-reconfigure -plow unattended-upgrades
   ```
2. SSH: keys only (after confirming key login works), no root login.
   In `/etc/ssh/sshd_config`: `PasswordAuthentication no`, `PermitRootLogin no`, then `sudo systemctl restart ssh`.
3. Firewall
   ```bash
   sudo ufw allow OpenSSH
   sudo ufw enable
   ```
   Gotcha: ports published by Docker (`-p 8080:8080`) bypass ufw. Core and every app must publish on
   `127.0.0.1` only, or not at all, and be reached through the proxy / Tailscale.
4. Docker Engine and the Compose plugin (official packages, not the snap)
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
   Do not add your everyday user to the `docker` group: that group is root-equivalent.
5. Tailscale, for private HTTPS access from anywhere without opening ports
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up
   ```
   Enable MagicDNS and HTTPS certificates in the Tailscale admin console.
6. Claude Code
   ```bash
   curl -fsSL https://claude.ai/install.sh | bash
   ```
   Run it as your normal user, inside the repo, with permission prompts on (never
   `--dangerously-skip-permissions` on this machine). It will ask before `sudo` and `docker` commands;
   read them.
7. Folders
   ```
   /srv/avalon/            the git checkout of this repo
   /srv/avalon-data/       Core's SQLite database, uploads, stack files, backups (not in git)
   ```

## 3. Repository layout after the work

```
index.html results.html research.html treasury.html   (unchanged static apps)
server.html  server.css  server/                      the new "Server" app (frontend)
os/engineer.js                                        the new soldier
core/                                                 Avalon Core (backend)
  package.json  Dockerfile
  src/index.js        Fastify app, static files, routes
  src/auth.js         users, sessions, TOTP, setup token
  src/docker.js       dockerode wrapper: an allow-list of actions
  src/stacks.js       Compose stacks (docker compose CLI)
  src/system.js       metrics (systeminformation), sampling, history ring buffer
  src/live.js         WebSocket hub: metrics, container stats, events, logs
  src/data.js         per-app documents (SQLite) for sync
  src/sentinel.js     server-side health checks
  src/audit.js        who did what, when
  catalog/            app store templates (compose + metadata)
deploy/
  compose.yml         avalon-core (+ searxng later)
  .env.example
docs/
```

## 4. Avalon Core: technical choices

- **Node.js 22 LTS**, same language as the frontend.
- **Fastify** (+ `@fastify/static`, `@fastify/websocket`, `@fastify/cookie`, `@fastify/rate-limit`).
- **dockerode** for the Docker API over `/var/run/docker.sock`; the `docker compose` CLI (installed in
  the image) for stacks.
- **systeminformation** for metrics.
- **better-sqlite3** for storage; one file in `/srv/avalon-data/core.db`.
- **argon2** for password hashing, **otplib** for TOTP.

Container (in `deploy/compose.yml`):

```yaml
services:
  avalon-core:
    build: ../core
    restart: unless-stopped
    network_mode: host            # sees the host's interfaces; listens on 127.0.0.1 only
    environment:
      - AVALON_LISTEN=127.0.0.1:8080
      - AVALON_DATA=/data
      - AVALON_HOST_ROOT=/host
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /srv/avalon:/app/static:ro         # the Avalon pages
      - /srv/avalon-data:/data
      - /:/host:ro                         # disk usage of the host's mounts
      - /sys:/host/sys:ro                  # temperatures
```

HTTPS: `sudo tailscale serve --bg 8080` gives `https://<server>.<tailnet>.ts.net` with a valid
certificate, reachable only from your own devices. (A LAN-only alternative later: Caddy with its
internal CA, trusted on each device.)

Alternative considered: Core as a plain systemd service on the host (simpler metrics, no socket
mount). The container keeps the host clean and makes updates a `docker compose up -d --build`.

## 5. API

All JSON under `/api`, all behind a session except login and setup.

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/setup` (first run only, needs the setup token printed in Core's log) · `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me` · `POST /api/auth/totp` |
| System | `GET /api/system` (OS, kernel, CPU model, RAM, disks, uptime) · `GET /api/system/history?range=1h` |
| Containers | `GET /api/containers` · `POST /api/containers/:id/start|stop|restart` · `POST /api/containers/:id/update` (pull + recreate) · `DELETE /api/containers/:id` (needs `confirm`) · `GET /api/containers/:id/inspect` |
| Stacks | `GET /api/stacks` · `POST /api/stacks` (from catalog or pasted compose) · `POST /api/stacks/:name/up|down|pull` · `DELETE /api/stacks/:name` |
| Images | `GET /api/images` · `POST /api/images/prune` |
| Catalog | `GET /api/catalog` · `GET /api/catalog/:app` |
| Data sync | `GET /api/data/:app` · `PUT /api/data/:app/:doc` (with `baseVersion`, 409 on conflict) |
| Sentinel | `GET /api/sentinel` · `PUT /api/sentinel/services` |
| Audit | `GET /api/audit` |
| Live (WebSocket) | `/api/live`: subscribe to `metrics`, `containers`, `events`, `logs:<id>`, `stats:<id>` |
| Terminal (phase 6) | `/api/exec/:id` WebSocket, admin only, off by default |

Rules for the Docker layer: only the named actions above, never arbitrary commands or arbitrary
`docker run` arguments from the browser. Core refuses to stop or remove itself.

## 6. Security

- Login required for everything; first-run setup only with the one-time token from the log.
- Password (argon2) plus optional TOTP; sessions in httpOnly, Secure, SameSite=Strict cookies.
- Every state-changing request checks `Origin` and a custom header (CSRF).
- Rate-limited login; lockout after repeated failures.
- Reached only through Tailscale (or the LAN); nothing published on a public interface.
- Destructive actions need an explicit confirmation field; all actions go to the audit log.
- The terminal is off unless enabled in settings.
- Secrets in stack `.env` files stay on the server and are never sent back to the browser in full.
- Nightly backup of `/srv/avalon-data` (SQLite `.backup` + stack files), kept for 14 days.

## 7. The frontend: the "Server" app

A fifth app in the switcher (`G` then `X`), same look as Treasury: HUD panels, live numbers.

- **Overview**: CPU, memory, disk and network gauges (live), load, temperatures, uptime, a 1-hour
  history, the busiest containers, and alerts (disk above 85 %, container restarting in a loop).
- **Containers**: cards with state, uptime, CPU and memory, ports (as links), image and whether an
  update is available; start / stop / restart / update; a log viewer that streams and searches; details.
- **Stacks & App store**: install apps from templates (Jellyfin, Nextcloud, Pi-hole, Vaultwarden,
  Uptime Kuma, SearXNG…), each asking only for its variables (ports, folders, passwords); manage
  existing stacks; edit a stack's compose file with a diff before applying.
- **Storage**: disks and mounts with usage; later, a file browser restricted to chosen folders.
- **Activity**: the audit log and Docker events.

Login: on the server, Avalon's lock screen becomes the login screen (same intro animation), and the
OS bar shows the signed-in user and server health.

**The engineer**: a new iron soldier for this app: a welding visor flipped up, a hard hat, a tool belt
and a wrench. He reports what the server is doing ("Jellyfin restarted · CPU 12 %"), hammers while a
stack deploys, and his eyes follow server health (cyan / amber / red).

## 8. Data moving to the server (sync)

- Core stores each app's data as documents with a version number.
- Each app keeps working offline with its browser copy; when Core is reachable it pulls on open and
  pushes on change. A version conflict (two devices edited) is resolved per record by `updatedAt`,
  which means adding `updatedAt` to Treasury and Home records.
- First login on each browser offers "Move this browser's data to the server" (uses the existing
  JSON backups).
- Research uploads (PDFs, images) move to `/srv/avalon-data/files` in the last step of this phase.
- The GitHub token stays per browser unless you choose to store it on the server.

## 9. Phases (stop for review after each)

| # | Phase | Done when |
|---|---|---|
| 0 | Server baseline (section 2) | SSH keys only, ufw on, Docker and Tailscale running, repo cloned to `/srv/avalon` |
| 1 | Core skeleton | Core serves Avalon at the Tailscale HTTPS address; setup, login, logout, lock screen as login; audit log |
| 2 | Live system | Server app with Overview: live gauges, 1-hour history, alerts |
| 3 | Containers | List, start/stop/restart, update, logs, stats, events, with confirmations |
| 4 | Data on the server | Treasury, Home, then Research sync between devices; migration from browser backups |
| 5 | Stacks & App store | Install from catalog, manage compose stacks, SearXNG installed beside Avalon |
| 6 | Extras | Engineer soldier everywhere, Sentinel server-side, notifications, optional terminal and file browser, nightly backups |

## 10. Working on it

- The repo stays on GitHub. The server clones it to `/srv/avalon`; Claude Code on the server works
  there. Avoid editing the same files on the PC and the server at the same time; pull before starting.
- Deploy: `cd /srv/avalon/deploy && docker compose up -d --build`.
- Static-app changes are live after `git pull` (Core serves the checkout); a short cache lifetime on
  the static files keeps browsers from holding old scripts.

## 11. Open questions

- Access: Tailscale only, or also plain LAN without Tailscale?
- A friendly name for the address (`avalon.<tailnet>.ts.net`)?
- Which apps to put in the first catalog?
- Where should backups go besides the server (a USB disk, another machine)?
- One user, or more people in the house with their own logins?
