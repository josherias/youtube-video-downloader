<?php

namespace App\Services;

use App\Models\DownloadJob;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class AdminAnalyticsService
{
    /**
     * @return array<string, mixed>
     */
    public function overview(?Carbon $from = null, ?Carbon $to = null): array
    {
        $base = DownloadJob::query();
        $this->applyDateRange($base, $from, $to);

        $byStatus = (clone $base)
            ->select('status', DB::raw('count(*) as total'))
            ->groupBy('status')
            ->pluck('total', 'status')
            ->all();

        $total = array_sum($byStatus);
        $completed = (int) ($byStatus['completed'] ?? 0);
        $failed = (int) ($byStatus['failed'] ?? 0);
        $cancelled = (int) ($byStatus['cancelled'] ?? 0);
        $active = (int) (($byStatus['queued'] ?? 0) + ($byStatus['processing'] ?? 0));

        $bytes = (clone $base)
            ->where('status', 'completed')
            ->sum('size');

        $uniqueIps = (int) (clone $base)
            ->whereNotNull('client_ip')
            ->where('client_ip', '!=', '')
            ->selectRaw('count(distinct client_ip) as aggregate')
            ->value('aggregate');

        $batches = (int) (clone $base)
            ->whereNotNull('batch_id')
            ->selectRaw('count(distinct batch_id) as aggregate')
            ->value('aggregate');

        $byFormat = (clone $base)
            ->select('format', DB::raw('count(*) as total'))
            ->groupBy('format')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($row) => [
                'format' => $row->format ?: 'unknown',
                'total' => (int) $row->total,
            ])
            ->all();

        $byQuality = (clone $base)
            ->select('quality', DB::raw('count(*) as total'))
            ->groupBy('quality')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($row) => [
                'quality' => $row->quality ?: 'unknown',
                'total' => (int) $row->total,
            ])
            ->all();

        return [
            'totals' => [
                'all' => $total,
                'completed' => $completed,
                'failed' => $failed,
                'cancelled' => $cancelled,
                'active' => $active,
                'unique_ips' => $uniqueIps,
                'batches' => $batches,
                'bytes_completed' => (int) $bytes,
            ],
            'by_status' => $byStatus,
            'by_format' => $byFormat,
            'by_quality' => $byQuality,
            'daily' => $this->dailyCounts($from, $to),
            'top_ips' => $this->topIps($from, $to, 15),
        ];
    }

    /**
     * @return list<array{date: string, total: int, completed: int, failed: int, cancelled: int}>
     */
    public function dailyCounts(?Carbon $from = null, ?Carbon $to = null): array
    {
        $from ??= now()->subDays(13)->startOfDay();
        $to ??= now()->endOfDay();

        $rows = DownloadJob::query()
            ->whereBetween('created_at', [$from, $to])
            ->selectRaw("date(created_at) as day")
            ->selectRaw('count(*) as total')
            ->selectRaw("sum(case when status = 'completed' then 1 else 0 end) as completed")
            ->selectRaw("sum(case when status = 'failed' then 1 else 0 end) as failed")
            ->selectRaw("sum(case when status = 'cancelled' then 1 else 0 end) as cancelled")
            ->groupBy('day')
            ->orderBy('day')
            ->get()
            ->keyBy('day');

        $days = [];
        $cursor = $from->copy()->startOfDay();
        while ($cursor->lte($to)) {
            $key = $cursor->toDateString();
            $row = $rows->get($key);
            $days[] = [
                'date' => $key,
                'total' => (int) ($row->total ?? 0),
                'completed' => (int) ($row->completed ?? 0),
                'failed' => (int) ($row->failed ?? 0),
                'cancelled' => (int) ($row->cancelled ?? 0),
            ];
            $cursor->addDay();
        }

        return $days;
    }

    /**
     * @return list<array{ip: string, total: int, completed: int, failed: int, last_seen: string|null}>
     */
    public function topIps(?Carbon $from = null, ?Carbon $to = null, int $limit = 15): array
    {
        $query = DownloadJob::query()
            ->whereNotNull('client_ip')
            ->where('client_ip', '!=', '');

        $this->applyDateRange($query, $from, $to);

        return $query
            ->select('client_ip')
            ->selectRaw('count(*) as total')
            ->selectRaw("sum(case when status = 'completed' then 1 else 0 end) as completed")
            ->selectRaw("sum(case when status = 'failed' then 1 else 0 end) as failed")
            ->selectRaw('max(created_at) as last_seen')
            ->groupBy('client_ip')
            ->orderByDesc('total')
            ->limit($limit)
            ->get()
            ->map(fn ($row) => [
                'ip' => $row->client_ip,
                'total' => (int) $row->total,
                'completed' => (int) $row->completed,
                'failed' => (int) $row->failed,
                'last_seen' => $row->last_seen
                    ? Carbon::parse($row->last_seen)->toIso8601String()
                    : null,
            ])
            ->all();
    }

    /**
     * @param  array{status?: string|null, ip?: string|null, q?: string|null, per_page?: int}  $filters
     */
    public function jobs(array $filters = []): LengthAwarePaginator
    {
        $query = DownloadJob::query()->orderByDesc('created_at');

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (! empty($filters['ip'])) {
            $query->where('client_ip', 'like', '%'.$filters['ip'].'%');
        }

        if (! empty($filters['q'])) {
            $q = $filters['q'];
            $query->where(function ($builder) use ($q) {
                $builder
                    ->where('title', 'like', '%'.$q.'%')
                    ->orWhere('url', 'like', '%'.$q.'%')
                    ->orWhere('channel', 'like', '%'.$q.'%')
                    ->orWhere('id', 'like', '%'.$q.'%');
            });
        }

        $perPage = min(100, max(1, (int) ($filters['per_page'] ?? 25)));

        return $query->paginate($perPage)->through(fn (DownloadJob $job) => $job->toAdminArray());
    }

    private function applyDateRange($query, ?Carbon $from, ?Carbon $to): void
    {
        if ($from) {
            $query->where('created_at', '>=', $from);
        }
        if ($to) {
            $query->where('created_at', '<=', $to);
        }
    }
}
