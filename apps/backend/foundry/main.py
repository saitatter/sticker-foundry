import logging
import math
import re
from http import HTTPStatus
from uuid import uuid4

import redis
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from . import __version__, admin, auth, collaboration, health, jobs, packs, teams
from .common import request_context
from .config import get_settings

log = logging.getLogger(__name__)
RATE_SCRIPT = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {count, redis.call('PTTL', KEYS[1])}
"""


def error_response(status, message, *, headers=None):
    return JSONResponse(
        {"message": message, "error": HTTPStatus(status).phrase, "statusCode": status},
        status_code=status,
        headers=headers,
    )


class RequestSafety:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = {
            key.decode("latin1").lower(): value.decode("latin1") for key, value in scope.get("headers", [])
        }
        request_id = headers.get("x-request-id", "")
        if not re.fullmatch(r"[a-zA-Z0-9._:-]{1,128}", request_id):
            request_id = str(uuid4())
        token = request_context.set(
            {
                "requestId": request_id,
                "ipAddress": (scope.get("client") or (None,))[0],
                "userAgent": headers.get("user-agent", "")[:500],
            }
        )

        async def response_send(message):
            if message["type"] == "http.response.start":
                message["headers"] = [
                    *message.get("headers", []),
                    (b"x-request-id", request_id.encode()),
                    (b"x-content-type-options", b"nosniff"),
                    (b"x-frame-options", b"SAMEORIGIN"),
                    (b"referrer-policy", b"no-referrer"),
                ]
            await send(message)

        try:
            limit = 11 * 1024 * 1024
            try:
                size = int(headers.get("content-length", 0))
            except ValueError:
                return await error_response(400, "Invalid content length")(scope, receive, response_send)
            if size > limit:
                return await error_response(413, "Request is too large")(scope, receive, response_send)
            settings = get_settings()
            path, method = scope["path"], scope["method"]
            if (
                not settings.testing
                and method != "OPTIONS"
                and path not in {"/api/health", "/api/health/ready", "/api/metrics"}
            ):
                # Redis calls run off the ASGI event loop.
                import asyncio

                ip = (scope.get("client") or ("unknown",))[0]
                try:
                    count, ttl = await asyncio.to_thread(
                        health.get_redis().eval,
                        RATE_SCRIPT,
                        1,
                        f"{settings.queue_prefix}:rate:all:{ip}",
                        settings.throttle_ttl_ms,
                    )
                    maximum = settings.throttle_limit
                    if count <= maximum:
                        kind, maximum = "", 0
                        if method == "POST" and path in {"/api/auth/login", "/api/auth/register"}:
                            kind, maximum = path, 10
                        elif path == "/api/auth/password/reset/request" and method == "POST":
                            kind, maximum = path, 5
                        elif path == "/api/auth/refresh" and method == "POST":
                            kind, maximum = path, 120
                        elif method in {"POST", "PUT"} and any(
                            path.endswith(suffix)
                            for suffix in ("/stickers", "/stickers/jobs", "/file", "/tray-icon")
                        ):
                            kind, maximum = "upload", 20
                        if kind:
                            count, ttl = await asyncio.to_thread(
                                health.get_redis().eval,
                                RATE_SCRIPT,
                                1,
                                f"{settings.queue_prefix}:rate:{kind}:{ip}",
                                60_000,
                            )
                    if maximum and count > maximum:
                        return await error_response(
                            429,
                            "Too many requests",
                            headers={"Retry-After": str(max(1, math.ceil(ttl / 1000)))},
                        )(scope, receive, response_send)
                except redis.RedisError:
                    return await error_response(
                        503, "Request limiting is temporarily unavailable", headers={"Retry-After": "5"}
                    )(scope, receive, response_send)
            received = 0

            async def limited_receive():
                nonlocal received
                message = await receive()
                if message["type"] == "http.request":
                    received += len(message.get("body", b""))
                    if received > limit:
                        raise HTTPException(413, "Request is too large")
                return message

            await self.app(scope, limited_receive, response_send)
        finally:
            request_context.reset(token)


def create_app():
    config = get_settings()
    app = FastAPI(
        title="Sticker Foundry API",
        version=__version__,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )
    app.add_middleware(RequestSafety)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "If-Match",
            "If-None-Match",
            "X-Refresh-Cookie",
            "X-Request-ID",
        ],
        expose_headers=["ETag", "Retry-After", "Content-Disposition", "X-Request-ID"],
    )

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, error: HTTPException):
        return error_response(error.status_code, error.detail, headers=error.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, error: RequestValidationError):
        messages = [f"{'.'.join(map(str, item['loc'][1:]))}: {item['msg']}" for item in error.errors()]
        return error_response(400, messages)

    @app.exception_handler(FileNotFoundError)
    async def missing_file(request: Request, error: FileNotFoundError):
        return error_response(404, "Media file not found")

    @app.exception_handler(IntegrityError)
    async def conflict(request: Request, error: IntegrityError):
        return error_response(409, "This action conflicts with existing data")

    for api in [
        auth.router,
        admin.public_router,
        admin.router,
        packs.router,
        packs.public_router,
        packs.sync_router,
        collaboration.router,
        teams.router,
        jobs.router,
        health.router,
    ]:
        app.include_router(api, prefix="/api")
    return app


app = create_app()
