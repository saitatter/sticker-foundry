import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from tool.preview_web import create_server


@pytest.fixture
def preview(tmp_path):
    release_stream = threading.Event()

    class API(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            self.wfile.write(b"data: progress\n\n")
            self.wfile.flush()
            release_stream.wait(10)

        def do_POST(self):
            body = self.rfile.read(int(self.headers["Content-Length"]))
            self.send_response(201)
            self.send_header("Content-Type", "application/json")
            self.send_header("Set-Cookie", "session=test; HttpOnly")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args):
            pass

    (tmp_path / "index.html").write_text("Flutter index", encoding="utf-8")
    (tmp_path / "app.wasm").write_bytes(b"wasm")
    with ThreadingHTTPServer(("127.0.0.1", 0), API) as api:
        with create_server(0, f"http://127.0.0.1:{api.server_port}", tmp_path) as web:
            threads = [threading.Thread(target=server.serve_forever, daemon=True) for server in (api, web)]
            for thread in threads:
                thread.start()
            try:
                yield f"http://127.0.0.1:{web.server_port}"
            finally:
                release_stream.set()
                for server in (web, api):
                    server.shutdown()
                for thread in threads:
                    thread.join()


def test_preview_serves_spa_routes_and_wasm(preview):
    with urllib.request.urlopen(f"{preview}/app/packs/example/stickers") as response:
        assert response.read() == b"Flutter index"
    with urllib.request.urlopen(f"{preview}/app.wasm") as response:
        assert response.headers["Content-Type"] == "application/wasm"


def test_preview_blocks_traversal_and_proxies_bodies_and_cookies(preview):
    with pytest.raises(urllib.error.HTTPError) as error:
        urllib.request.urlopen(f"{preview}/%2e%2e/secret")
    assert error.value.code == 403
    request = urllib.request.Request(
        f"{preview}/api/auth/login", b'{"email":"test@example.test"}', method="POST"
    )
    with urllib.request.urlopen(request) as response:
        assert response.status == 201
        assert response.read() == b'{"email":"test@example.test"}'
        assert response.headers["Set-Cookie"] == "session=test; HttpOnly"


def test_preview_streams_job_progress_before_the_upstream_closes(preview):
    with urllib.request.urlopen(f"{preview}/api/jobs/example/events", timeout=2) as response:
        assert response.readline() == b"data: progress\n"
