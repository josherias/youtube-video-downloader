<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreBatchDownloadRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $max = (int) config('downloader.max_batch_size', 25);

        return [
            'quality' => ['sometimes', Rule::in(['best', '1080', '720', '480'])],
            'format' => ['sometimes', Rule::in(['mp4', 'webm', 'mp3', 'm4a'])],
            'codec' => ['sometimes', Rule::in(['compatible', 'best'])],
            'audio_only' => ['sometimes', 'boolean'],
            'items' => ['required', 'array', 'min:1', 'max:'.$max],
            'items.*.url' => ['required', 'url', 'max:2048'],
            'items.*.title' => ['sometimes', 'nullable', 'string', 'max:500'],
            'items.*.channel' => ['sometimes', 'nullable', 'string', 'max:255'],
            'items.*.duration' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'items.*.duration_string' => ['sometimes', 'nullable', 'string', 'max:32'],
            'items.*.thumbnail' => ['sometimes', 'nullable', 'string', 'max:2048'],
        ];
    }

    public function messages(): array
    {
        return [
            'items.required' => 'Select at least one video.',
            'items.max' => 'Too many videos selected for one batch.',
        ];
    }
}
