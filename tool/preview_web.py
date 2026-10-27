"""Serve a built Flutter client locally, with SPA routing and an optional API proxy."""

import argparse
import http.client
import mimetypes
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
}


def create_server(port=5173, api_origin="http://127.0.0.1:8080", web_root=None):
    root = Path(web_root or ROOT / "apps/client/build/web").resolve()
    upstream = urlsplit(api_origin)
    if (
        upstream.scheme not in {"http", "https"}
        or not upstream.hostname
        or upstream.username
        or upstream.password
    ):
        raise ValueError("API origin must be an HTTP(S) URL without credentials")

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.respond()

        do_HEAD = do_POST = do_PUT = do_PATCH = do_DELETE = do_OPTIONS = do_GET

        def log_message(self, *_args):
            pass

        def respond(self):
            if urlsplit(self.path).path.startswith("/api/"):
                self.proxy()
                return
            if self.command not in {"GET", "HEAD"}:
                self.send_error(405)
                return
            relative = unquote(urlsplit(self.path).path).lstrip("/")
            target = (root / relative).resolve()
            if not target.is_relative_to(root):
                self.send_error(403)
                return
            if target.is_dir():
                target /= "index.html"
            if not target.is_file():
                target = root / "index.html"
            try:
                data = target.read_bytes()
            except FileNotFoundError:
                self.send_error(503, "Build the Flutter web client first")
                return
            mime = {".js": "application/javascript", ".wasm": "application/wasm"}.get(target.suffix)
            self.send_response(200)
            self.send_header(
                "Content-Type",
                mime or mimetypes.guess_type(target.name)[0] or "application/octet-stream",
            )
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(data)

        def proxy(self):
            connection_type = (
                http.client.HTTPSConnection if upstream.scheme == "https" else http.client.HTTPConnection
            )
            connection = connection_type(upstream.hostname, upstream.port, timeout=90)
            started = False
            try:
                size = int(self.headers.get("Content-Length", 0))
                if size < 0 or size > 11 * 1024 * 1024:
                    self.send_error(413)
                    return
                if self.headers.get("Transfer-Encoding"):
                    self.send_error(400, "Chunked uploads are not supported by this local preview")
                    return
                headers = {
                    key: value
                    for key, value in self.headers.items()
                    if key.lower() not in HOP_HEADERS | {"host"}
                }
                connection.request(
                    self.command,
                    self.path,
                    body=self.rfile.read(size) if size else None,
                    headers=headers,
                )
                response = connection.getresponse()
                streaming = response.getheader("Content-Type", "").startswith("text/event-stream")
                body = None if streaming else response.read()
                self.send_response(response.status)
                for key, value in response.getheaders():
                    if key.lower() not in HOP_HEADERS | {"content-length"}:
                        self.send_header(key, value)
                if body is not None:
                    self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                started = True
                if streaming:
                    while chunk := response.read1(8192):
                        self.wfile.write(chunk)
                        self.wfile.flush()
                elif self.command != "HEAD":
                    self.wfile.write(body)
            except (OSError, http.client.HTTPException, ValueError):
                if not started:
                    self.send_error(502, "API unavailable")
                else:
                    self.close_connection = True
            finally:
                connection.close()

    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=5173)
    parser.add_argument("--api-origin", default=os.getenv("API_ORIGIN", "http://127.0.0.1:8080"))
    args = parser.parse_args()
    with create_server(args.port, args.api_origin) as server:
        print(f"Sticker Foundry: http://127.0.0.1:{server.server_port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
