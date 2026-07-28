# TubeGrab — first-time VPS setup (Contabo-style)

App path: `/var/www/tubegrab`. GitHub Actions deploys on push to `main`. Keep `.env` on the server only.

## Packages

```bash
sudo apt update
sudo apt install -y nginx php8.3-fpm php8.3-cli php8.3-sqlite3 php8.3-mbstring \
  php8.3-xml php8.3-curl php8.3-zip php8.3-bcmath unzip curl git \
  python3 python3-pip ffmpeg
```

Also install Composer and Node 20+ / Yarn.

**Run Composer as your deploy user, not root.** The lockfile targets **PHP 8.3**.

```bash
python3 -m pip install --user -r /var/www/tubegrab/scripts/requirements.txt
```

## Clone

```bash
sudo mkdir -p /var/www/tubegrab
sudo chown -R $USER:www-data /var/www/tubegrab
git clone git@github.com:josherias/youtube-video-downloader.git /var/www/tubegrab
cd /var/www/tubegrab && git checkout main
```

## Backend `.env`

```bash
cd /var/www/tubegrab/backend
cp .env.example .env
php artisan key:generate
# edit APP_URL, FRONTEND_URL, CORS_ALLOWED_ORIGINS, ADMIN_*
touch database/database.sqlite
composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan db:seed --force --class=AdminUserSeeder
php artisan storage:link
chmod -R ug+rwx storage bootstrap/cache
```

## Frontend

```bash
cd /var/www/tubegrab/frontend
echo 'VITE_API_BASE_URL=https://your-domain' > .env
yarn install && yarn build
```

## Nginx + queue

```bash
sudo cp /var/www/tubegrab/deploy/nginx.tubegrab.conf.example /etc/nginx/sites-available/tubegrab
# edit server_name + php8.3-fpm.sock
sudo ln -sf /etc/nginx/sites-available/tubegrab /etc/nginx/sites-enabled/tubegrab
sudo nginx -t && sudo systemctl reload nginx

sudo cp /var/www/tubegrab/deploy/tubegrab-queue.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tubegrab-queue
```

## GitHub secrets

`SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `SSH_PORT`
