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
            'trim_start' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'trim_end' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'title' => ['sometimes', 'nullable', 'string', 'max:500'],
            'channel' => ['sometimes', 'nullable', 'string', 'max:255'],
            'duration' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'duration_string' => ['sometimes', 'nullable', 'string', 'max:32'],
            'thumbnail' => ['sometimes', 'nullable', 'url', 'max:2048'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            $hasStart = $this->input('trim_start') !== null && $this->input('trim_start') !== '';
            $hasEnd = $this->input('trim_end') !== null && $this->input('trim_end') !== '';

            if (! $hasStart && ! $hasEnd) {
                return;
            }

            if (! $hasEnd) {
                $validator->errors()->add('trim_end', 'Clip end time is required when trimming.');

                return;
            }

            $start = $hasStart ? (float) $this->input('trim_start') : 0.0;
            $end = (float) $this->input('trim_end');

            if ($end <= $start) {
                $validator->errors()->add('trim_end', 'Clip end must be greater than start.');
            }
        });
    }

    public function messages(): array
    {
        return [
            'url.required' => 'A YouTube URL is required.',
            'url.url' => 'Please provide a valid URL.',
        ];
    }
}
