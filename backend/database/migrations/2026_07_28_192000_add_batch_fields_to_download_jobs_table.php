<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('download_jobs', function (Blueprint $table) {
            $table->uuid('batch_id')->nullable()->after('id')->index();
            $table->unsignedInteger('batch_index')->nullable()->after('batch_id');
        });
    }

    public function down(): void
    {
        Schema::table('download_jobs', function (Blueprint $table) {
            $table->dropColumn(['batch_id', 'batch_index']);
        });
    }
};
