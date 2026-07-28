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

        $result = Process::timeout(90)
            ->env($this->processEnv())
            ->run([$python, $script, $url, '--info']);

        if (! $result->successful()) {
            $stderr = trim($result->errorOutput() ?: $result->output());
            throw new RuntimeException($stderr !== '' ? $stderr : 'Could not fetch video info.');
        }

        $payload = json_decode(trim($result->output()), true);
        if (! is_array($payload)) {
            throw new RuntimeException('Invalid metadata response.');
        }

        return $payload;
    }

    public function queue(string $url, string $quality = 'best', bool $audioOnly = false, ?array $preview = null): DownloadJob
    {
        $this->assertYouTubeUrl($url);

        $job = DownloadJob::query()->create([
            'id' => (string) Str::uuid(),
            'url' => $url,
            'quality' => $quality,
            'audio_only' => $audioOnly,
            'status' => 'queued',
            'progress' => 0,
            'title' => $preview['title'] ?? null,
            'channel' => $preview['channel'] ?? null,
            'duration' => isset($preview['duration']) ? (int) $preview['duration'] : null,
            'duration_string' => $preview['duration_string'] ?? null,
            'thumbnail' => $preview['thumbnail'] ?? null,
        ]);

        File::ensureDirectoryExists($this->jobDirectory($job->id));

        return $job;
    }

    public function run(DownloadJob $job): DownloadJob
    {
        $outdir = $this->jobDirectory($job->id);
        $progressFile = $outdir.'/progress.json';
        $resultFile = $outdir.'/result.json';

        File::ensureDirectoryExists($outdir);
        File::put($progressFile, json_encode(['status' => 'starting', 'percent' => 0]));

        $job->update([
            'status' => 'processing',
            'progress' => 0,
            'error_message' => null,
        ]);

        $command = [
            $this->resolvePython(),
            $this->scriptPath(),
            $job->url,
            '-o',
            $outdir,
            '-q',
            $job->quality,
            '--progress-file',
            $progressFile,
            '--result-file',
            $resultFile,
        ];

        if ($job->audio_only) {
            $command[] = '-a';
        }

        $process = Process::timeout((int) config('downloader.timeout', 600))
            ->env($this->processEnv())
            ->start($command);

        while ($process->running()) {
            $this->syncProgress($job, $progressFile);
            usleep(400000);
        }

        $this->syncProgress($job, $progressFile);
        $result = $process->wait();

        if (! $result->successful()) {
            $stderr = trim($result->errorOutput() ?: $result->output());
            $job->update([
                'status' => 'failed',
                'progress' => (float) $job->progress,
                'error_message' => $stderr !== '' ? $this->cleanError($stderr) : 'Download failed.',
            ]);

            return $job->fresh();
        }

        $file = $this->findDownloadedFile($outdir);
        $meta = File::exists($resultFile)
            ? json_decode(File::get($resultFile), true)
            : null;

        if ($file === null) {
            $job->update([
                'status' => 'failed',
                'error_message' => 'Download finished but no output file was found.',
            ]);

            return $job->fresh();
        }

        $job->update([
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
        ]);

        return $job->fresh();
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

        $job->progress = max((float) $job->progress, min(99.0, $percent));
        if ($job->status === 'queued') {
            $job->status = 'processing';
        }
        $job->save();
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
                    && ! in_array($name, ['progress.json', 'result.json'], true)
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
}
