<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreDownloadRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'url' => ['required', 'url', 'max:2048'],
            'quality' => ['sometimes', Rule::in(['best', '1080', '720', '480'])],
            'format' => ['sometimes', Rule::in(['mp4', 'webm', 'mp3', 'm4a'])],
            'codec' => ['sometimes', Rule::in(['compatible', 'best'])],
            'audio_only' => ['sometimes', 'boolean'],
            'title' => ['sometimes', 'nullable', 'string', 'max:500'],
            'channel' => ['sometimes', 'nullable', 'string', 'max:255'],
            'duration' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'duration_string' => ['sometimes', 'nullable', 'string', 'max:32'],
            'thumbnail' => ['sometimes', 'nullable', 'url', 'max:2048'],
        ];
    }

    public function messages(): array
    {
        return [
            'url.required' => 'A YouTube URL is required.',
            'url.url' => 'Please provide a valid URL.',
        ];
    }
}
