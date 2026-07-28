<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Download timeout (seconds)
    |--------------------------------------------------------------------------
    */
    'timeout' => (int) env('DOWNLOADER_TIMEOUT', 600),

    /*
    |--------------------------------------------------------------------------
    | Playlist / batch limits
    |--------------------------------------------------------------------------
    */
    'max_playlist_entries' => (int) env('DOWNLOADER_MAX_PLAYLIST_ENTRIES', 50),
    'max_batch_size' => (int) env('DOWNLOADER_MAX_BATCH_SIZE', 25),

    /*
    |--------------------------------------------------------------------------
    | Admin account (seeded via php artisan db:seed)
    |--------------------------------------------------------------------------
    */
    'admin_name' => (string) env('ADMIN_NAME', 'Admin'),
    'admin_email' => (string) env('ADMIN_EMAIL', 'admin@tubegrab.local'),
    'admin_password' => (string) env('ADMIN_PASSWORD', 'password'),
];
