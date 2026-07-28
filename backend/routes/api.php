<?php

use App\Http\Controllers\AdminAuthController;
use App\Http\Controllers\AdminController;
use App\Http\Controllers\DownloadController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok']));

Route::post('/preview', [DownloadController::class, 'preview']);
Route::post('/downloads', [DownloadController::class, 'store']);
Route::post('/downloads/batch', [DownloadController::class, 'storeBatch']);
Route::post('/downloads/{id}/cancel', [DownloadController::class, 'cancel']);
Route::post('/batches/{id}/cancel', [DownloadController::class, 'cancelBatch']);
Route::get('/batches/{id}', [DownloadController::class, 'showBatch']);
Route::get('/downloads/{id}', [DownloadController::class, 'show']);
Route::get('/downloads/{id}/file', [DownloadController::class, 'file']);

Route::prefix('admin')->group(function () {
    Route::post('/login', [AdminAuthController::class, 'login']);

    Route::middleware('admin.auth')->group(function () {
        Route::post('/logout', [AdminAuthController::class, 'logout']);
        Route::get('/me', [AdminAuthController::class, 'me']);
        Route::get('/overview', [AdminController::class, 'overview']);
        Route::get('/jobs', [AdminController::class, 'jobs']);
    });
});
