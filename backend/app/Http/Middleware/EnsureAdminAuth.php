<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAdminAuth
{
    public function handle(Request $request, Closure $next): Response
    {
        $plain = $request->bearerToken()
            ?: (string) $request->header('X-Admin-Token', '');

        if ($plain === '') {
            return response()->json(['error' => 'Unauthorized.'], 401);
        }

        $user = User::query()
            ->where('is_admin', true)
            ->where('api_token', hash('sha256', $plain))
            ->first();

        if (! $user) {
            return response()->json(['error' => 'Unauthorized.'], 401);
        }

        $request->setUserResolver(fn () => $user);

        return $next($request);
    }
}
