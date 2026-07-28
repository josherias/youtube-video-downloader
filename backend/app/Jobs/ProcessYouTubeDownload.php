<?php

namespace App\Jobs;

use App\Models\DownloadJob;
use App\Services\YouTubeDownloadService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

class ProcessYouTubeDownload implements ShouldQueue
{
    use Queueable;

    public int $timeout = 660;

    public int $tries = 1;

    public function __construct(public string $downloadJobId) {}

    public function handle(YouTubeDownloadService $downloads): void
    {
        $job = DownloadJob::query()->find($this->downloadJobId);
        if (! $job || in_array($job->status, ['completed', 'failed'], true)) {
            return;
        }

        $downloads->run($job);
    }

    public function failed(?Throwable $exception): void
    {
        $job = DownloadJob::query()->find($this->downloadJobId);
        if (! $job || $job->status === 'completed') {
            return;
        }

        $job->update([
            'status' => 'failed',
            'error_message' => $exception?->getMessage() ?: 'Download failed unexpectedly.',
        ]);
    }
}
