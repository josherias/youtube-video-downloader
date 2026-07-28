<?php

use App\Http\Controllers\DownloadController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok']));

Route::post('/preview', [DownloadController::class, 'preview']);
Route::post('/downloads', [DownloadController::class, 'store']);
Route::get('/downloads/{id}', [DownloadController::class, 'show']);
Route::get('/downloads/{id}/file', [DownloadController::class, 'file']);
