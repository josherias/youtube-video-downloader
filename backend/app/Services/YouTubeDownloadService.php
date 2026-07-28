<?php

namespace App\Services;

use App\Models\DownloadJob;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Str;
use RuntimeException;

class YouTubeDownloadService
{
    public function preview(string $url): array
    {
        $this->assertYouTubeUrl($url);

        $script = $this->scriptPath();
        $python = $this->resolvePython();
        $maxEntries = (int) config('downloader.max_playlist_entries', 50);

        $result = Process::timeout(120)
            ->env($this->processEnv())
            ->run([
                $python,
                $script,
                $url,
                '--info',
                '--max-entries',
                (string) $maxEntries,
            ]);

        if (! $result->successful()) {
            $stderr = trim($result->errorOutput() ?: $result->output());
            throw new RuntimeException($stderr !== '' ? $stderr : 'Could not fetch video info.');
        }

        $payload = json_decode(trim($result->output()), true);
        if (! is_array($payload)) {
            throw new RuntimeException('Invalid metadata response.');
        }

        if (($payload['type'] ?? 'video') !== 'playlist') {
            $payload['type'] = 'video';
        }

        return $payload;
    }

    public function queue(
        string $url,
        string $quality = 'best',
        string $format = 'mp4',
        string $codec = 'compatible',
        ?array $preview = null,
        ?string $batchId = null,
        ?int $batchIndex = null,
        ?float $trimStart = null,
        ?float $trimEnd = null,
        ?string $clientIp = null,
        ?string $userAgent = null,
    ): DownloadJob {
        $this->assertYouTubeUrl($url);

        $format = strtolower($format);
        $codec = strtolower($codec);
        if (! in_array($format, ['mp4', 'webm', 'mp3', 'm4a'], true)) {
            $format = 'mp4';
        }
        if (! in_array($codec, ['compatible', 'best'], true)) {
            $codec = 'compatible';
        }

        if ($trimStart !== null || $trimEnd !== null) {
            $trimStart = $trimStart ?? 0.0;
            if ($trimEnd === null || $trimEnd <= $trimStart) {
                throw new RuntimeException('Clip end must be greater than start.');
            }
        }

        $job = DownloadJob::query()->create([
            'id' => (string) Str::uuid(),
            'batch_id' => $batchId,
            'batch_index' => $batchIndex,
            'url' => $url,
            'quality' => $quality,
            'format' => $format,
            'codec' => $codec,
            'trim_start' => $trimStart,
            'trim_end' => $trimEnd,
            'audio_only' => in_array($format, ['mp3', 'm4a'], true),
            'status' => 'queued',
            'progress' => 0,
            'title' => $preview['title'] ?? null,
            'channel' => $preview['channel'] ?? null,
            'duration' => isset($preview['duration']) ? (int) $preview['duration'] : null,
            'duration_string' => $preview['duration_string'] ?? null,
            'thumbnail' => $preview['thumbnail'] ?? null,
            'client_ip' => $clientIp,
            'user_agent' => $userAgent !== null ? Str::limit($userAgent, 1000, '') : null,
        ]);

        File::ensureDirectoryExists($this->jobDirectory($job->id));

        return $job;
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     * @return array{batch_id: string, jobs: list<DownloadJob>}
     */
    public function queueBatch(
        array $items,
        string $quality = 'best',
        string $format = 'mp4',
        string $codec = 'compatible',
        ?string $clientIp = null,
        ?string $userAgent = null,
    ): array {
        $max = (int) config('downloader.max_batch_size', 25);
        if ($items === []) {
            throw new RuntimeException('Select at least one video to download.');
        }
        if (count($items) > $max) {
            throw new RuntimeException("Batch downloads are limited to {$max} videos.");
        }

        $batchId = (string) Str::uuid();
        $jobs = [];

        foreach (array_values($items) as $index => $item) {
            $url = $item['url'] ?? $item['webpage_url'] ?? null;
            if (! is_string($url) || $url === '') {
                throw new RuntimeException('Each batch item needs a valid URL.');
            }

            $this->assertYouTubeUrl($url);

            $preview = array_filter([
                'title' => $item['title'] ?? null,
                'channel' => $item['channel'] ?? null,
                'duration' => $item['duration'] ?? null,
                'duration_string' => $item['duration_string'] ?? null,
                'thumbnail' => $item['thumbnail'] ?? null,
            ], fn ($value) => $value !== null && $value !== '');

            $jobs[] = $this->queue(
                $url,
                $quality,
                $format,
                $codec,
                $preview !== [] ? $preview : null,
                $batchId,
                $index,
                null,
                null,
                $clientIp,
                $userAgent,
            );
        }

        return [
            'batch_id' => $batchId,
            'jobs' => $jobs,
        ];
    }

    public function batchStatus(string $batchId): ?array
    {
        if (! Str::isUuid($batchId)) {
            return null;
        }

        $jobs = DownloadJob::query()
            ->where('batch_id', $batchId)
            ->orderBy('batch_index')
            ->get();

        if ($jobs->isEmpty()) {
            return null;
        }

        foreach ($jobs as $job) {
            if (in_array($job->status, ['queued', 'processing'], true)) {
                $this->readProgress($job);
            }
        }

        $jobs = DownloadJob::query()
            ->where('batch_id', $batchId)
            ->orderBy('batch_index')
            ->get();

        $total = $jobs->count();
        $completed = $jobs->where('status', 'completed')->count();
        $failed = $jobs->where('status', 'failed')->count();
        $cancelled = $jobs->where('status', 'cancelled')->count();
        $processing = $jobs->whereIn('status', ['queued', 'processing'])->count();

        $status = match (true) {
            $processing > 0 => 'processing',
            $cancelled === $total => 'cancelled',
            $failed === $total => 'failed',
            $completed === $total => 'completed',
            ($failed + $cancelled) > 0 && $completed > 0 => 'partial',
            $cancelled > 0 && $failed > 0 && $completed === 0 => 'cancelled',
            $cancelled > 0 && $completed === 0 && $failed === 0 => 'cancelled',
            default => 'processing',
        };

        $progressSum = $jobs->sum(function (DownloadJob $job) {
            if (in_array($job->status, ['completed', 'failed', 'cancelled'], true)) {
                return 100;
            }

            return (float) $job->progress;
        });

        return [
            'id' => $batchId,
            'status' => $status,
            'progress' => $total > 0 ? round($progressSum / $total, 1) : 0,
            'total' => $total,
            'completed' => $completed,
            'failed' => $failed,
            'cancelled' => $cancelled,
            'processing' => $processing,
            'jobs' => $jobs->map->toApiArray()->values()->all(),
        ];
    }

    public function cancel(string $id): DownloadJob
    {
        $job = DownloadJob::query()->find($id);
        if (! $job) {
            throw new RuntimeException('Download not found.');
        }

        if (! in_array($job->status, ['queued', 'processing'], true)) {
            throw new RuntimeException('Only queued or active downloads can be cancelled.');
        }

        File::ensureDirectoryExists($this->jobDirectory($job->id));
        File::put($this->cancelFlagPath($job->id), '1');

        // Drop pending queue payloads so a cancelled job never starts.
        try {
            \Illuminate\Support\Facades\DB::table('jobs')
                ->where('payload', 'like', '%'.$job->id.'%')
                ->delete();
        } catch (\Throwable) {
            // Best-effort; cancel flag still stops an in-flight worker.
        }

        return $this->markCancelled($job);
    }

    public function cancelBatch(string $batchId): array
    {
        if (! Str::isUuid($batchId)) {
            throw new RuntimeException('Batch not found.');
        }

        $jobs = DownloadJob::query()
            ->where('batch_id', $batchId)
            ->whereIn('status', ['queued', 'processing'])
            ->get();

        if ($jobs->isEmpty() && ! DownloadJob::query()->where('batch_id', $batchId)->exists()) {
            throw new RuntimeException('Batch not found.');
        }

        foreach ($jobs as $job) {
            $this->cancel($job->id);
        }

        $batch = $this->batchStatus($batchId);
        if ($batch === null) {
            throw new RuntimeException('Batch not found.');
        }

        return $batch;
    }

    public function run(DownloadJob $job): DownloadJob
    {
        $job->refresh();
        if ($this->isCancelled($job)) {
            return $this->markCancelled($job);
        }

        $outdir = $this->jobDirectory($job->id);
        $progressFile = $outdir.'/progress.json';
        $resultFile = $outdir.'/result.json';

        File::ensureDirectoryExists($outdir);
        File::put($progressFile, json_encode(['status' => 'starting', 'percent' => 0]));

        // Claim only if still queued — never overwrite a cancel.
        $claimed = DownloadJob::query()
            ->where('id', $job->id)
            ->where('status', 'queued')
            ->update([
                'status' => 'processing',
                'progress' => 0,
                'error_message' => null,
                'updated_at' => now(),
            ]);

        $job->refresh();
        if ($this->isCancelled($job)) {
            return $this->markCancelled($job);
        }
        if ($claimed === 0) {
            // Another worker owns it, or it already finished.
            return $job;
        }

        $command = [
            $this->resolvePython(),
            $this->scriptPath(),
            $job->url,
            '-o',
            $outdir,
            '-q',
            $job->quality ?: 'best',
            '-f',
            $job->format ?: 'mp4',
            '--codec',
            $job->codec ?: 'compatible',
            '--progress-file',
            $progressFile,
            '--result-file',
            $resultFile,
        ];

        if ($job->trim_end !== null) {
            $command[] = '--start';
            $command[] = (string) ($job->trim_start ?? 0);
            $command[] = '--end';
            $command[] = (string) $job->trim_end;
        }

        $process = Process::timeout((int) config('downloader.timeout', 600))
            ->env($this->processEnv())
            ->start($command);

        while ($process->running()) {
            if ($this->isCancelled($job)) {
                $this->stopProcess($process);
                $this->cleanupPartialFiles($outdir);

                return $this->markCancelled($job);
            }

            $this->syncProgress($job, $progressFile);
            usleep(400000);
        }

        $this->syncProgress($job, $progressFile);
        $result = $process->wait();

        if ($this->isCancelled($job)) {
            $this->cleanupPartialFiles($outdir);

            return $this->markCancelled($job);
        }

        if (! $result->successful()) {
            $stderr = trim($result->errorOutput() ?: $result->output());
            DownloadJob::query()
                ->where('id', $job->id)
                ->whereIn('status', ['queued', 'processing'])
                ->update([
                    'status' => 'failed',
                    'progress' => (float) $job->progress,
                    'error_message' => $stderr !== '' ? $this->cleanError($stderr) : 'Download failed.',
                    'updated_at' => now(),
                ]);

            return $job->fresh();
        }

        $file = $this->findDownloadedFile($outdir);
        $meta = File::exists($resultFile)
            ? json_decode(File::get($resultFile), true)
            : null;

        if ($this->isCancelled($job)) {
            $this->cleanupPartialFiles($outdir);

            return $this->markCancelled($job);
        }

        if ($file === null) {
            DownloadJob::query()
                ->where('id', $job->id)
                ->whereIn('status', ['queued', 'processing'])
                ->update([
                    'status' => 'failed',
                    'error_message' => 'Download finished but no output file was found.',
                    'updated_at' => now(),
                ]);

            return $job->fresh();
        }

        DownloadJob::query()
            ->where('id', $job->id)
            ->whereIn('status', ['queued', 'processing'])
            ->update([
                'status' => 'completed',
                'progress' => 100,
                'filename' => is_array($meta) && ! empty($meta['filename'])
                    ? $meta['filename']
                    : $file->getFilename(),
                'extension' => is_array($meta) && ! empty($meta['extension'])
                    ? $meta['extension']
                    : $file->getExtension(),
                'size' => is_array($meta) && isset($meta['size'])
                    ? (int) $meta['size']
                    : $file->getSize(),
                'title' => $job->title ?: $this->titleFromFilename($file->getFilename()),
                'error_message' => null,
                'updated_at' => now(),
            ]);

        $job->refresh();
        if ($job->status !== 'completed' && $this->isCancelled($job)) {
            $this->cleanupPartialFiles($outdir);

            return $this->markCancelled($job);
        }

        return $job;
    }

    public function resolveFile(string $id): ?\SplFileInfo
    {
        if (! Str::isUuid($id)) {
            return null;
        }

        $job = DownloadJob::query()->find($id);
        if ($job && $job->status !== 'completed') {
            return null;
        }

        $outdir = $this->jobDirectory($id);
        if (! File::isDirectory($outdir)) {
            return null;
        }

        return $this->findDownloadedFile($outdir);
    }

    public function readProgress(DownloadJob $job): void
    {
        if (! in_array($job->status, ['queued', 'processing'], true)) {
            return;
        }

        $this->syncProgress($job, $this->jobDirectory($job->id).'/progress.json');
    }

    private function syncProgress(DownloadJob $job, string $progressFile): void
    {
        if ($this->hasCancelFlag($job->id)) {
            return;
        }

        if (! File::exists($progressFile)) {
            return;
        }

        $payload = json_decode(File::get($progressFile), true);
        if (! is_array($payload)) {
            return;
        }

        $percent = isset($payload['percent']) ? (float) $payload['percent'] : null;
        if ($percent === null) {
            return;
        }

        $next = max((float) $job->progress, min(99.0, $percent));

        DownloadJob::query()
            ->where('id', $job->id)
            ->whereIn('status', ['queued', 'processing'])
            ->update([
                'progress' => $next,
                'status' => 'processing',
                'updated_at' => now(),
            ]);

        $job->refresh();
    }

    private function scriptPath(): string
    {
        $script = base_path('../scripts/download.py');
        if (! File::exists($script)) {
            throw new RuntimeException('Download script not found at scripts/download.py');
        }

        return $script;
    }

    private function jobDirectory(string $id): string
    {
        return storage_path('app/downloads/'.$id);
    }

    private function assertYouTubeUrl(string $url): void
    {
        $host = parse_url($url, PHP_URL_HOST);
        if (! is_string($host)) {
            throw new RuntimeException('Invalid URL.');
        }

        $host = strtolower($host);
        $allowed = [
            'youtube.com',
            'www.youtube.com',
            'm.youtube.com',
            'youtu.be',
            'www.youtu.be',
            'music.youtube.com',
        ];

        if (! in_array($host, $allowed, true)) {
            throw new RuntimeException('Only YouTube URLs are supported.');
        }
    }

    private function resolvePython(): string
    {
        foreach (['python3', 'python'] as $bin) {
            $which = Process::run(['which', $bin]);
            if ($which->successful()) {
                return trim($which->output());
            }
        }

        throw new RuntimeException('python3 is not available on this server.');
    }

    private function processEnv(): array
    {
        $env = [
            'PATH' => getenv('PATH') ?: '/usr/local/bin:/usr/bin:/bin',
            'HOME' => getenv('HOME') ?: '/tmp',
            'LANG' => 'C.UTF-8',
        ];

        $libPaths = array_filter([
            '/usr/lib/x86_64-linux-gnu/blas',
            '/usr/lib/x86_64-linux-gnu/lapack',
            getenv('LD_LIBRARY_PATH') ?: null,
        ]);

        if ($libPaths !== []) {
            $env['LD_LIBRARY_PATH'] = implode(':', $libPaths);
        }

        return $env;
    }

    private function findDownloadedFile(string $outdir): ?\SplFileInfo
    {
        $files = collect(File::files($outdir))
            ->filter(function ($file) {
                $name = $file->getFilename();

                return ! str_ends_with($name, '.part')
                    && ! in_array($name, ['progress.json', 'result.json', 'cancel.flag'], true)
                    && ! str_ends_with($name, '.json.tmp');
            })
            ->sortByDesc(fn ($file) => $file->getSize())
            ->values();

        return $files->first();
    }

    private function titleFromFilename(string $filename): string
    {
        $name = pathinfo($filename, PATHINFO_FILENAME);
        $name = preg_replace('/\s*\[[^\]]+\]\s*$/', '', $name) ?? $name;

        return trim($name) !== '' ? trim($name) : $filename;
    }

    private function cleanError(string $message): string
    {
        $message = preg_replace('/^ERROR:\s*/i', '', $message) ?? $message;
        $lines = array_values(array_filter(array_map('trim', explode("\n", $message))));

        return $lines[0] ?? 'Download failed.';
    }

    private function cancelFlagPath(string $id): string
    {
        return $this->jobDirectory($id).'/cancel.flag';
    }

    private function hasCancelFlag(string $id): bool
    {
        return File::exists($this->cancelFlagPath($id));
    }

    private function isCancelled(DownloadJob $job): bool
    {
        $job->refresh();

        return $job->status === 'cancelled' || $this->hasCancelFlag($job->id);
    }

    private function markCancelled(DownloadJob $job): DownloadJob
    {
        DownloadJob::query()
            ->where('id', $job->id)
            ->whereNotIn('status', ['completed'])
            ->update([
                'status' => 'cancelled',
                'error_message' => 'Cancelled by user.',
                'updated_at' => now(),
            ]);

        return $job->fresh();
    }

    private function stopProcess(mixed $process): void
    {
        try {
            if (method_exists($process, 'signal')) {
                $process->signal(defined('SIGTERM') ? SIGTERM : 15);
            }
        } catch (\Throwable) {
            // Continue with stronger stop attempts.
        }

        usleep(300000);

        try {
            if (method_exists($process, 'running') && $process->running()) {
                if (method_exists($process, 'signal')) {
                    $process->signal(defined('SIGKILL') ? SIGKILL : 9);
                }
            }
        } catch (\Throwable) {
            // Best-effort kill.
        }

        // Kill process group / children when available.
        try {
            $pid = method_exists($process, 'id') ? $process->id() : null;
            if (is_int($pid) && $pid > 1 && function_exists('posix_kill')) {
                @posix_kill(-$pid, defined('SIGKILL') ? SIGKILL : 9);
                @posix_kill($pid, defined('SIGKILL') ? SIGKILL : 9);
            }
        } catch (\Throwable) {
            // Best-effort kill.
        }
    }

    private function cleanupPartialFiles(string $outdir): void
    {
        if (! File::isDirectory($outdir)) {
            return;
        }

        foreach (File::files($outdir) as $file) {
            $name = $file->getFilename();
            if (
                str_ends_with($name, '.part')
                || (! in_array($name, ['progress.json', 'result.json', 'cancel.flag'], true)
                    && ! str_ends_with($name, '.json.tmp'))
            ) {
                // Keep cancel/progress markers; remove media and partials.
                if (in_array($name, ['progress.json', 'result.json', 'cancel.flag'], true)) {
                    continue;
                }
                File::delete($file->getPathname());
            }
        }
    }
}
