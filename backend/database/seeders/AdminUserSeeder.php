<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        $email = (string) config('downloader.admin_email', 'admin@tubegrab.local');
        $password = (string) config('downloader.admin_password', 'password');
        $name = (string) config('downloader.admin_name', 'Admin');

        User::query()->updateOrCreate(
            ['email' => $email],
            [
                'name' => $name,
                'password' => $password,
                'is_admin' => true,
            ],
        );
    }
}
