# YouTube Downloader

Laravel API + React SPA monorepo (same layout as the RENU whistle-blowing system).

```
backend/   # Laravel API
frontend/  # React + Vite SPA
scripts/   # Python yt-dlp helper used by the API
```

## Requirements

- PHP 8.2+, Composer
- Node.js + Yarn
- Python 3 + `yt-dlp` (`pip install --user -r scripts/requirements.txt`)
- `ffmpeg` (recommended for MP4 merge + audio)

## Backend

```bash
cd backend
cp .env.example .env   # if needed
composer install
php artisan key:generate
php artisan migrate
php artisan serve      # http://localhost:8000

# In a second terminal — required for async downloads
php artisan queue:work
```

Useful env keys:

```
APP_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
DOWNLOADER_TIMEOUT=600
QUEUE_CONNECTION=database
ADMIN_EMAIL=admin@tubegrab.local
ADMIN_PASSWORD=password
```

Admin dashboard: `http://localhost:5173/admin/login`  
Seed the admin user with `php artisan db:seed --class=AdminUserSeeder` (or full `db:seed`).

## Frontend

```bash
cd frontend
cp .env.example .env
yarn install
yarn dev               # http://localhost:5173
```

`VITE_API_BASE_URL` should point at the Laravel API (default `http://localhost:8000`).

## API

- `POST /api/preview` — `{ "url": "..." }` → video or playlist metadata
- `POST /api/downloads` — queue a single video (`format`, `codec`, optional `trim_start` / `trim_end` seconds)
- `POST /api/downloads/batch` — `{ "items": [{ "url": "..." }], "quality": "720", "format": "mp4", "codec": "compatible" }`
- `POST /api/downloads/{id}/cancel` — cancel a queued/active download
- `POST /api/batches/{id}/cancel` — cancel all active jobs in a batch
- `GET /api/batches/{id}` — batch status + per-video progress
- `GET /api/downloads/{id}` — single job status + progress
- `GET /api/downloads/{id}/file` — download a ready file
- `GET /api/health` — health check
- `POST /api/admin/login` — `{ "email", "password" }` → bearer token
- `POST /api/admin/logout` — revoke token (auth required)
- `GET /api/admin/me` — current admin user
- `GET /api/admin/overview?days=14` — totals, daily volume, top IPs, format/quality breakdown
- `GET /api/admin/jobs` — paginated job log (`status`, `ip`, `q` filters)

Playlist previews are capped by `DOWNLOADER_MAX_PLAYLIST_ENTRIES` (default 50).
Batch size is capped by `DOWNLOADER_MAX_BATCH_SIZE` (default 25).

## Deploy (VPS / Contabo + GitHub Actions)

Same pattern as wifispot: SSH deploy on push to `main`, app at `/var/www/tubegrab`, secrets stay in server `.env`.

### GitHub secrets

| Secret | Purpose |
|--------|---------|
| `SSH_HOST` | VPS host |
| `SSH_USER` | Deploy user |
| `SSH_PRIVATE_KEY` | SSH private key |
| `SSH_PORT` | Usually `22` |

Workflow: [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)

### First-time server setup

See **[deploy/SERVER_SETUP.md](deploy/SERVER_SETUP.md)** for:

- Packages (`php-fpm`, `nginx`, `ffmpeg`, Python/`yt-dlp`)
- Clone to `/var/www/tubegrab`
- Production `.env` + admin seed
- Frontend `VITE_API_BASE_URL=https://your-domain`
- Nginx example: [`deploy/nginx.tubegrab.conf.example`](deploy/nginx.tubegrab.conf.example)
- Queue worker systemd unit: [`deploy/tubegrab-queue.service`](deploy/tubegrab-queue.service) (**required** — downloads won’t run without it)

After setup, merge/push to `main` to deploy.
