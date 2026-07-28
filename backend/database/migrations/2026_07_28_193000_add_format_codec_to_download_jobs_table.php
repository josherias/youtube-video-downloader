<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('download_jobs', function (Blueprint $table) {
            $table->string('format', 8)->default('mp4')->after('quality');
            $table->string('codec', 16)->default('compatible')->after('format');
        });
    }

    public function down(): void
    {
        Schema::table('download_jobs', function (Blueprint $table) {
            $table->dropColumn(['format', 'codec']);
        });
    }
};
