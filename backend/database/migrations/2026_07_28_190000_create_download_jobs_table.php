<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('download_jobs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('url', 2048);
            $table->string('quality', 16)->default('best');
            $table->boolean('audio_only')->default(false);
            $table->string('status', 32)->default('queued'); // queued|processing|completed|failed
            $table->decimal('progress', 5, 1)->default(0);
            $table->string('title')->nullable();
            $table->string('channel')->nullable();
            $table->unsignedInteger('duration')->nullable();
            $table->string('duration_string', 32)->nullable();
            $table->string('thumbnail', 2048)->nullable();
            $table->string('filename')->nullable();
            $table->string('extension', 16)->nullable();
            $table->unsignedBigInteger('size')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('download_jobs');
    }
};
