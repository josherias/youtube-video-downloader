<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreDownloadRequest;
use App\Services\YouTubeDownloadService;
use Illuminate\Http\JsonResponse;
use RuntimeException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class DownloadController extends ApiController
{
    public function __construct(private readonly YouTubeDownloadService $downloads) {}

    public function store(StoreDownloadRequest $request): JsonResponse
    {
        try {
            $validated = $request->validated();

            $result = $this->downloads->download(
                $validated['url'],
                $validated['quality'] ?? 'best',
                (bool) ($validated['audio_only'] ?? false),
            );
        } catch (RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), 422);
        } catch (\Throwable $e) {
            report($e);

            return $this->errorResponse('Unexpected download error.', 500);
        }

        return $this->successResponser([
            'message' => 'Download ready.',
            'data' => [
                'id' => $result['id'],
                'title' => $result['title'],
                'filename' => $result['filename'],
                'extension' => $result['extension'],
                'size' => $result['size'],
                'download_url' => $result['download_url'],
            ],
        ], 201);
    }

    public function file(string $id): BinaryFileResponse|JsonResponse
    {
        $file = $this->downloads->resolveFile($id);
        if ($file === null) {
            return $this->errorResponse('Download not found or expired.', 404);
        }

        $filename = $file->getFilename();
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
}
