<?php

namespace App\Services;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Str;
use RuntimeException;

class YouTubeDownloadService
{
    public function download(string $url, string $quality = 'best', bool $audioOnly = false): array
    {
        $this->assertYouTubeUrl($url);

        $jobId = (string) Str::uuid();
        $outdir = storage_path('app/downloads/'.$jobId);
        File::ensureDirectoryExists($outdir);

        $script = base_path('../scripts/download.py');
        if (! File::exists($script)) {
            throw new RuntimeException('Download script not found at scripts/download.py');
        }

        $python = $this->resolvePython();
        $command = [
            $python,
            $script,
            $url,
            '-o',
            $outdir,
            '-q',
            $quality,
        ];

        if ($audioOnly) {
            $command[] = '-a';
        }

        $result = Process::timeout((int) config('downloader.timeout', 600))
            ->env($this->processEnv())
            ->run($command);

        if (! $result->successful()) {
            File::deleteDirectory($outdir);
            $stderr = trim($result->errorOutput() ?: $result->output());
            throw new RuntimeException($stderr !== '' ? $stderr : 'Download failed.');
        }

        $file = $this->findDownloadedFile($outdir);
        if ($file === null) {
            File::deleteDirectory($outdir);
            throw new RuntimeException('Download finished but no output file was found.');
        }

        $title = $this->titleFromFilename($file->getFilename());

        return [
            'id' => $jobId,
            'title' => $title,
            'filename' => $file->getFilename(),
            'extension' => $file->getExtension(),
            'size' => $file->getSize(),
            'path' => $file->getPathname(),
            'download_url' => url('/api/downloads/'.$jobId.'/file'),
        ];
    }

    public function resolveFile(string $id): ?\SplFileInfo
    {
        if (! Str::isUuid($id)) {
            return null;
        }

        $outdir = storage_path('app/downloads/'.$id);
        if (! File::isDirectory($outdir)) {
            return null;
        }

        return $this->findDownloadedFile($outdir);
    }

    public function forget(string $id): void
    {
        if (! Str::isUuid($id)) {
            return;
        }

        $outdir = storage_path('app/downloads/'.$id);
        if (File::isDirectory($outdir)) {
            File::deleteDirectory($outdir);
        }
    }

    private function assertYouTubeUrl(string $url): void
    {
        $host = parse_url($url, PHP_URL_HOST);
        if (! is_string($host)) {
            throw new RuntimeException('Invalid URL.');
        }

        $host = strtolower($host);
        $allowed = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be', 'music.youtube.com'];

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
            ->filter(fn ($file) => ! str_ends_with($file->getFilename(), '.part'))
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
}
