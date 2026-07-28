<?php

use App\Http\Controllers\DownloadController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok']));

Route::post('/preview', [DownloadController::class, 'preview']);
Route::post('/downloads', [DownloadController::class, 'store']);
Route::post('/downloads/batch', [DownloadController::class, 'storeBatch']);
Route::get('/batches/{id}', [DownloadController::class, 'showBatch']);
Route::get('/downloads/{id}', [DownloadController::class, 'show']);
Route::get('/downloads/{id}/file', [DownloadController::class, 'file']);
