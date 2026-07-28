<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class DownloadJob extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'url',
        'quality',
        'audio_only',
        'status',
        'progress',
        'title',
        'channel',
        'duration',
        'duration_string',
        'thumbnail',
        'filename',
        'extension',
        'size',
        'error_message',
    ];

    protected function casts(): array
    {
        return [
            'audio_only' => 'boolean',
            'progress' => 'float',
            'duration' => 'integer',
            'size' => 'integer',
        ];
    }

    public function toApiArray(): array
    {
        return [
            'id' => $this->id,
            'url' => $this->url,
            'quality' => $this->quality,
            'audio_only' => $this->audio_only,
            'status' => $this->status,
            'progress' => (float) $this->progress,
            'title' => $this->title,
            'channel' => $this->channel,
            'duration' => $this->duration,
            'duration_string' => $this->duration_string,
            'thumbnail' => $this->thumbnail,
            'filename' => $this->filename,
            'extension' => $this->extension,
            'size' => $this->size,
            'error_message' => $this->error_message,
            'download_url' => $this->status === 'completed'
                ? url('/api/downloads/'.$this->id.'/file')
                : null,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
