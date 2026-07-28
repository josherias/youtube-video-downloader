<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('download_jobs', function (Blueprint $table) {
            $table->string('client_ip', 45)->nullable()->after('error_message');
            $table->text('user_agent')->nullable()->after('client_ip');
            $table->index('client_ip');
            $table->index('created_at');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::table('download_jobs', function (Blueprint $table) {
            $table->dropIndex(['client_ip']);
            $table->dropIndex(['created_at']);
            $table->dropIndex(['status']);
            $table->dropColumn(['client_ip', 'user_agent']);
        });
    }
};
