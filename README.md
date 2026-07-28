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
php artisan serve      # http://localhost:8000
```

Useful env keys:

```
APP_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
DOWNLOADER_TIMEOUT=600
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

- `POST /api/downloads` — `{ "url": "...", "quality": "best|1080|720|480", "audio_only": false }`
- `GET /api/downloads/{id}/file` — download the prepared file
- `GET /api/health` — health check
