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
```

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
- `POST /api/downloads` — queue a single video (`format`: mp4|webm|mp3|m4a, `codec`: compatible|best)
- `POST /api/downloads/batch` — `{ "items": [{ "url": "..." }], "quality": "720", "format": "mp4", "codec": "compatible" }`
- `GET /api/batches/{id}` — batch status + per-video progress
- `GET /api/downloads/{id}` — single job status + progress
- `GET /api/downloads/{id}/file` — download a ready file
- `GET /api/health` — health check

Playlist previews are capped by `DOWNLOADER_MAX_PLAYLIST_ENTRIES` (default 50).
Batch size is capped by `DOWNLOADER_MAX_BATCH_SIZE` (default 25).
