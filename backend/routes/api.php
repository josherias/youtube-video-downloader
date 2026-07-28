<?php

use App\Http\Controllers\DownloadController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok']));

Route::post('/downloads', [DownloadController::class, 'store']);
Route::get('/downloads/{id}/file', [DownloadController::class, 'file']);
