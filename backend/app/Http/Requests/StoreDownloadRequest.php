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
            'audio_only' => ['sometimes', 'boolean'],
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
