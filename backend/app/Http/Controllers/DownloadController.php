<?php

namespace App\Http\Controllers;

use App\Http\Requests\PreviewDownloadRequest;
use App\Http\Requests\StoreBatchDownloadRequest;
use App\Http\Requests\StoreDownloadRequest;
use App\Jobs\ProcessYouTubeDownload;
use App\Models\DownloadJob;
use App\Services\YouTubeDownloadService;
use Illuminate\Http\JsonResponse;
use RuntimeException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class DownloadController extends ApiController
{
    public function __construct(private readonly YouTubeDownloadService $downloads) {}

    public function preview(PreviewDownloadRequest $request): JsonResponse
    {
        try {
            $info = $this->downloads->preview($request->validated('url'));
        } catch (RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), 422);
        } catch (\Throwable $e) {
            report($e);

            return $this->errorResponse('Could not fetch video info.', 500);
        }

        return $this->successResponser([
            'message' => 'Preview ready.',
            'data' => $info,
        ]);
    }

    public function store(StoreDownloadRequest $request): JsonResponse
    {
        try {
            $validated = $request->validated();

            $preview = array_filter([
                'title' => $validated['title'] ?? null,
                'channel' => $validated['channel'] ?? null,
                'duration' => $validated['duration'] ?? null,
                'duration_string' => $validated['duration_string'] ?? null,
                'thumbnail' => $validated['thumbnail'] ?? null,
            ], fn ($value) => $value !== null && $value !== '');

            $job = $this->downloads->queue(
                $validated['url'],
                $validated['quality'] ?? 'best',
                $this->resolveFormat($validated),
                $validated['codec'] ?? 'compatible',
                $preview !== [] ? $preview : null,
                null,
                null,
                isset($validated['trim_end'])
                    ? (isset($validated['trim_start']) ? (float) $validated['trim_start'] : 0.0)
                    : null,
                isset($validated['trim_end']) ? (float) $validated['trim_end'] : null,
                $request->ip(),
                $request->userAgent(),
            );

            ProcessYouTubeDownload::dispatch($job->id);
        } catch (RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), 422);
        } catch (\Throwable $e) {
            report($e);

            return $this->errorResponse('Unexpected download error.', 500);
        }

        return $this->successResponser([
            'message' => 'Download queued.',
            'data' => $job->fresh()->toApiArray(),
        ], 202);
    }

    public function storeBatch(StoreBatchDownloadRequest $request): JsonResponse
    {
        try {
            $validated = $request->validated();
            $result = $this->downloads->queueBatch(
                $validated['items'],
                $validated['quality'] ?? 'best',
                $this->resolveFormat($validated),
                $validated['codec'] ?? 'compatible',
                $request->ip(),
                $request->userAgent(),
            );

            foreach ($result['jobs'] as $job) {
                ProcessYouTubeDownload::dispatch($job->id);
            }

            $batch = $this->downloads->batchStatus($result['batch_id']);
        } catch (RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), 422);
        } catch (\Throwable $e) {
            report($e);

            return $this->errorResponse('Unexpected batch download error.', 500);
        }

        return $this->successResponser([
            'message' => 'Batch queued.',
            'data' => $batch,
        ], 202);
    }

    public function showBatch(string $id): JsonResponse
    {
        $batch = $this->downloads->batchStatus($id);
        if ($batch === null) {
            return $this->errorResponse('Batch not found.', 404);
        }

        return $this->successResponser([
            'data' => $batch,
        ]);
    }

    public function show(string $id): JsonResponse
    {
        $job = DownloadJob::query()->find($id);
        if (! $job) {
            return $this->errorResponse('Download not found.', 404);
        }

        if (in_array($job->status, ['queued', 'processing'], true)) {
            $this->downloads->readProgress($job);
            $job->refresh();
        }

        return $this->successResponser([
            'data' => $job->toApiArray(),
        ]);
    }

    public function cancel(string $id): JsonResponse
    {
        try {
            $job = $this->downloads->cancel($id);
        } catch (RuntimeException $e) {
            $code = str_contains(strtolower($e->getMessage()), 'not found') ? 404 : 422;

            return $this->errorResponse($e->getMessage(), $code);
        } catch (\Throwable $e) {
            report($e);

            return $this->errorResponse('Could not cancel download.', 500);
        }

        return $this->successResponser([
            'message' => 'Download cancelled.',
            'data' => $job->toApiArray(),
        ]);
    }

    public function cancelBatch(string $id): JsonResponse
    {
        try {
            $batch = $this->downloads->cancelBatch($id);
        } catch (RuntimeException $e) {
            $code = str_contains(strtolower($e->getMessage()), 'not found') ? 404 : 422;

            return $this->errorResponse($e->getMessage(), $code);
        } catch (\Throwable $e) {
            report($e);

            return $this->errorResponse('Could not cancel batch.', 500);
        }

        return $this->successResponser([
            'message' => 'Batch cancelled.',
            'data' => $batch,
        ]);
    }

    public function file(string $id): BinaryFileResponse|JsonResponse
    {
        $job = DownloadJob::query()->find($id);
        if (! $job || $job->status !== 'completed') {
            return $this->errorResponse('Download not found or not ready.', 404);
        }

        $file = $this->downloads->resolveFile($id);
        if ($file === null) {
            return $this->errorResponse('Download file missing.', 404);
        }

        $filename = $job->filename ?: $file->getFilename();
        $mime = match (strtolower($file->getExtension())) {
            'mp4' => 'video/mp4',
            'mp3' => 'audio/mpeg',
            'webm' => 'video/webm',
            'm4a' => 'audio/mp4',
            default => 'application/octet-stream',
        };

        return response()
            ->download($file->getPathname(), $filename, [
                'Content-Type' => $mime,
                'Access-Control-Expose-Headers' => 'Content-Disposition',
            ])
            ->deleteFileAfterSend(false);
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function resolveFormat(array $validated): string
    {
        if (! empty($validated['format'])) {
            return (string) $validated['format'];
        }

        // Backward compatibility with older clients.
        if (! empty($validated['audio_only'])) {
            return 'mp3';
        }

        return 'mp4';
    }
}
