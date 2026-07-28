<?php

namespace App\Traits;

trait ApiResponserTrait
{
    protected function errorResponse($message, $code)
    {
        return response()->json(['error' => $message], $code);
    }

    protected function successResponser($data, $code = 200)
    {
        return response()->json($data, $code);
    }
}
