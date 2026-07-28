<?php

namespace App\Http\Controllers;

use App\Services\AdminAnalyticsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class AdminController extends ApiController
{
    public function __construct(private readonly AdminAnalyticsService $analytics) {}

    public function overview(Request $request): JsonResponse
    {
        [$from, $to] = $this->resolveRange($request);

        return $this->successResponser([
            'data' => $this->analytics->overview($from, $to),
        ]);
    }

    public function jobs(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'status' => ['nullable', 'string', 'in:queued,processing,completed,failed,cancelled'],
            'ip' => ['nullable', 'string', 'max:64'],
            'q' => ['nullable', 'string', 'max:200'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $paginator = $this->analytics->jobs($filters);

        return $this->successResponser([
            'data' => $paginator->items(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    /**
     * @return array{0: ?Carbon, 1: ?Carbon}
     */
    private function resolveRange(Request $request): array
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'days' => ['nullable', 'integer', 'min:1', 'max:90'],
        ]);

        if (! empty($validated['from']) || ! empty($validated['to'])) {
            $from = ! empty($validated['from'])
                ? Carbon::parse($validated['from'])->startOfDay()
                : null;
            $to = ! empty($validated['to'])
                ? Carbon::parse($validated['to'])->endOfDay()
                : null;

            return [$from, $to];
        }

        $days = (int) ($validated['days'] ?? 14);

        return [
            now()->subDays($days - 1)->startOfDay(),
            now()->endOfDay(),
        ];
    }
}
