"""Run: python main.py --config config.local.json. Local bearer API on 127.0.0.1."""
from __future__ import annotations

import argparse
import hmac
import json
import os
import signal
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from core import Store, config, process_lock
from runner import Runner


def make_server(runner: Runner, token: str, port: int = 10089):
    if len(token) < 32:
        raise ValueError("RUNNER_TOKEN_MINIMUM_32_CHARACTERS")

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass  # Do not log prompts, local paths or access tokens.

        def reply(self, status, body):
            data = json.dumps(body, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def authorized(self):
            supplied = self.headers.get("Authorization", "")
            if (self.headers.get("Origin") or not hmac.compare_digest(supplied.encode(), ("Bearer " + token).encode())
                    or self.headers.get("Host") not in {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}):
                self.reply(403, {"error": "FORBIDDEN"})
                return False
            return True

        def do_GET(self):
            if not self.authorized():
                return
            parts = self.path.strip("/").split("/")
            if parts == ["v1", "jobs"]:
                self.reply(200, {"jobs": runner.store.list()})
            elif len(parts) == 3 and parts[:2] == ["v1", "jobs"]:
                record = runner.store.get(parts[2])
                if record:
                    record.pop("lease_token", None)
                self.reply(200 if record else 404, record or {"error": "NOT_FOUND"})
            else:
                self.reply(404, {"error": "NOT_FOUND"})

        def do_POST(self):
            if not self.authorized():
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 256 * 1024 or self.headers.get("Transfer-Encoding"):
                    self.reply(413, {"error": "INVALID_BODY_LENGTH"})
                    return
                self.connection.settimeout(5)
                body = json.loads(self.rfile.read(length))
                if not isinstance(body, dict):
                    raise ValueError("OBJECT_BODY_REQUIRED")
                parts = self.path.strip("/").split("/")
                if parts == ["v1", "jobs"]:
                    r = runner.enqueue(body)
                    self.reply(202, {"job_id": r["job"]["job_id"], "attempt_id": r["attempt_id"], "phase": r["phase"]})
                elif len(parts) == 4 and parts[:2] == ["v1", "jobs"]:
                    from core import safe_id
                    job_id = safe_id(parts[2])
                    if parts[3] == "approve":
                        runner.approve(job_id, body)
                    elif parts[3] == "resume":
                        runner.resume(job_id)
                    else:
                        self.reply(404, {"error": "NOT_FOUND"})
                        return
                    self.reply(200, {"ok": True})
                else:
                    self.reply(404, {"error": "NOT_FOUND"})
            except (ValueError, KeyError, TypeError, OSError):
                self.reply(409, {"error": "INVALID_OR_CONFLICTING_REQUEST"})

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.daemon_threads = True
    return server


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--port", default=10089, type=int)
    args = parser.parse_args()
    c = config(args.config)
    token = os.environ.get(c.get("api_token_env", "WORK_RUNNER_TOKEN"), "")
    stopped = threading.Event()
    with process_lock(c["data_dir"]):
        store = Store(c["data_dir"])
        runner = Runner(c, store)
        server = make_server(runner, token, args.port)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        for sig in (signal.SIGINT, signal.SIGTERM):
            signal.signal(sig, lambda *_: stopped.set())
        print(f"Work Runner listening on 127.0.0.1:{server.server_port}; browser/DOM calibration required.", flush=True)
        try:
            while not stopped.is_set():
                try:
                    runner.tick()
                except Exception as error:
                    print("Runner iteration stopped safely:", type(error).__name__, flush=True)
                stopped.wait(c["poll_seconds"])
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)
            store.close()


if __name__ == "__main__":
    main()
