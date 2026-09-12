"""Persistent single-conversation Work runner primitives (Python 3.11+)."""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import warnings
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from PIL import Image

MAX_BYTES = 64 * 1024 * 1024
TERMINAL = {"succeeded", "local_complete", "failed", "cancelled"}


def digest(value: Any) -> str:
    raw = value if isinstance(value, bytes) else json.dumps(value, sort_keys=True, ensure_ascii=False).encode()
    return hashlib.sha256(raw).hexdigest()


def safe_id(value: Any) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}", value):
        raise ValueError("INVALID_ID")
    return value


def conversation_url(value: str) -> str:
    u = urllib.parse.urlsplit(value)
    if u.scheme != "https" or u.netloc != "chatgpt.com" or u.query or u.fragment:
        raise ValueError("INVALID_CONVERSATION_URL")
    if not re.fullmatch(r"/c/[A-Za-z0-9-]+/?", u.path):
        raise ValueError("INVALID_CONVERSATION_URL")
    return "https://chatgpt.com" + u.path.rstrip("/")


def endpoint(value: str) -> str:
    u = urllib.parse.urlsplit(value)
    local = u.hostname in {"127.0.0.1", "::1"}
    if not u.hostname or u.username or u.password or u.query or u.fragment:
        raise ValueError("INVALID_ENDPOINT")
    if u.scheme != "https" and not (u.scheme == "http" and local):
        raise ValueError("HTTPS_REQUIRED")
    return value.rstrip("/")


def contained(root: str | Path, file: str | Path) -> Path:
    root, path = Path(root).expanduser().resolve(), Path(file).expanduser().resolve()
    if path == root or not path.is_relative_to(root):
        raise ValueError("PATH_OUTSIDE_ALLOWED_ROOT")
    return path


def config(path: str | Path) -> dict:
    c = json.loads(Path(path).read_text(encoding="utf-8"))
    c["conversation_url"] = conversation_url(c["conversation_url"])
    c["bridge_url"] = endpoint(c.get("bridge_url", "http://127.0.0.1:10088"))
    if urllib.parse.urlsplit(c["bridge_url"]).hostname not in {"127.0.0.1", "::1"}:
        raise ValueError("BRIDGE_MUST_BE_LOOPBACK")
    for key, default in [("data_dir", "~/.openbridge-work"), ("download_root", "~/Downloads"), ("input_root", "~/OpenBridgeInputs")]:
        c[key] = str(Path(c.get(key, default)).expanduser().resolve())
    for key in ("backend_url", "visual_url"):
        if c.get(key):
            c[key] = endpoint(c[key])
    for key, default, minimum in [("poll_seconds", 10, 1), ("stable_seconds", 15, 1), ("timeout_seconds", 5400, 60)]:
        c[key] = max(minimum, float(c.get(key, default)))
    c.setdefault("mode_pattern", "Work|工作")
    if not c["mode_pattern"] or len(c["mode_pattern"]) > 300:
        raise ValueError("MODE_PATTERN_REQUIRED")
    c.setdefault("selectors", {})
    if not isinstance(c["selectors"], dict) or not all(isinstance(x, str) for x in c["selectors"].values()):
        raise ValueError("INVALID_SELECTORS")
    c["runner_id"] = safe_id(c.get("runner_id", "local-runner"))
    return c


def validate_job(job: dict, c: dict) -> dict:
    allowed = {"job_id", "prompt", "input_paths", "expected_images", "min_width", "min_height", "input_version"}
    if not isinstance(job, dict) or set(job) - allowed:
        raise ValueError("UNKNOWN_JOB_FIELDS")
    safe_id(job.get("job_id"))
    if not isinstance(job.get("prompt"), str) or not job["prompt"].strip() or len(job["prompt"]) > 90_000:
        raise ValueError("INVALID_PROMPT")
    result = dict(job)
    result.setdefault("expected_images", 1)
    result.setdefault("min_width", 256)
    result.setdefault("min_height", 256)
    for key, maximum in [("expected_images", 20), ("min_width", 16000), ("min_height", 16000)]:
        if type(result[key]) is not int or not 1 <= result[key] <= maximum:
            raise ValueError("INVALID_IMAGE_REQUIREMENT")
    result.setdefault("input_paths", [])
    if not isinstance(result["input_paths"], list) or len(result["input_paths"]) > 10:
        raise ValueError("INVALID_INPUTS")
    for file in result["input_paths"]:
        p = contained(c["input_root"], file)
        if not p.is_file() or not 0 < p.stat().st_size <= MAX_BYTES:
            raise ValueError("INVALID_INPUT_FILE")
    result["input_paths"] = [str(contained(c["input_root"], x)) for x in result["input_paths"]]
    return result


class Store:
    def __init__(self, directory: str | Path):
        self.root = Path(directory)
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.lock = threading.RLock()
        self.db = sqlite3.connect(self.root / "state.sqlite", check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, phase TEXT NOT NULL, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY, job_id TEXT NOT NULL, body TEXT NOT NULL, delivered INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, due REAL DEFAULT 0);
        """)

    def add(self, job: dict, lease: str | None = None) -> dict:
        with self.lock:
            row = self.db.execute("SELECT * FROM jobs WHERE id=?", (job["job_id"],)).fetchone()
            if row:
                if row["fingerprint"] != digest(job):
                    raise ValueError("IDEMPOTENCY_CONFLICT")
                old = json.loads(row["data"])
                if lease and old.get("lease_token") != lease:
                    raise ValueError("LEASE_CONFLICT_RECONCILE_REQUIRED")
                return old
            attempt = uuid.uuid4().hex
            r = {"job": job, "attempt_id": attempt, "phase": "queued", "created": time.time(), "artifacts": [], "lease_token": lease}
            self.save(r)
            return r

    def save(self, r: dict) -> None:
        with self.lock, self.db:
            self.db.execute("INSERT INTO jobs VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET phase=excluded.phase,data=excluded.data",
                            (r["job"]["job_id"], digest(r["job"]), r["phase"], json.dumps(r)))

    def get(self, job_id: str) -> dict | None:
        with self.lock:
            row = self.db.execute("SELECT data FROM jobs WHERE id=?", (job_id,)).fetchone()
            return json.loads(row[0]) if row else None

    def active(self) -> dict | None:
        with self.lock:
            rows = self.db.execute("SELECT data FROM jobs ORDER BY rowid").fetchall()
            return next((r for row in rows if (r := json.loads(row[0]))["phase"] not in TERMINAL), None)

    def list(self) -> list:
        with self.lock:
            return [dict(r) for r in self.db.execute("SELECT id,phase FROM jobs ORDER BY rowid")]

    def event(self, r: dict, status: str, **extra: Any) -> str:
        body = {"job_id": r["job"]["job_id"], "attempt_id": r["attempt_id"], "status": status, **extra}
        event_id = digest(body)
        body["event_id"] = event_id
        with self.lock, self.db:
            self.db.execute("INSERT OR IGNORE INTO outbox(id,job_id,body) VALUES(?,?,?)", (event_id, body["job_id"], json.dumps(body)))
        return event_id

    def pending(self) -> list:
        with self.lock:
            return [dict(r) for r in self.db.execute("SELECT * FROM outbox WHERE delivered=0 AND due<=?", (time.time(),))]

    def acknowledge(self, event_id: str) -> None:
        with self.lock, self.db:
            self.db.execute("UPDATE outbox SET delivered=1 WHERE id=?", (event_id,))

    def defer(self, item: dict) -> None:
        with self.lock, self.db:
            self.db.execute("UPDATE outbox SET attempts=attempts+1,due=? WHERE id=?", (time.time() + min(300, 2 ** min(item["attempts"] + 1, 8)), item["id"]))

    def close(self) -> None:
        self.db.close()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("REDIRECT_REJECTED")


def request(url: str, *, method: str = "GET", payload: Any = None, raw: bytes | None = None,
            token: str | None = None, headers: dict | None = None, limit: int = MAX_BYTES) -> dict:
    body = json.dumps(payload).encode() if payload is not None else raw
    h = dict(headers or {})
    if payload is not None:
        h["Content-Type"] = "application/json"
    if token:
        h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    with urllib.request.build_opener(NoRedirect).open(req, timeout=30) as response:
        data = response.read(limit + 1)
        if len(data) > limit:
            raise ValueError("RESPONSE_TOO_LARGE")
        return json.loads(data) if data else {}


class Bridge:
    def __init__(self, c: dict):
        self.c = c
        self.connection = c.get("bridge_connection_id")

    def connect(self) -> None:
        health = request(self.c["bridge_url"] + "/health", limit=1024 * 1024)
        sessions = health.get("connectedSessions", [])
        if health.get("paused"):
            raise ValueError("BRIDGE_PAUSED")
        if not sessions:
            raise ConnectionError("BROWSER_OFFLINE")
        if self.connection is None:
            if len(sessions) != 1:
                raise ValueError("AMBIGUOUS_BRIDGE_CONNECTION")
            self.connection = sessions[0]
        if self.connection not in sessions:
            raise ConnectionError("BROWSER_CONNECTION_CHANGED")

    def call(self, tool: str, args: dict) -> dict:
        result = request(self.c["bridge_url"] + "/command", method="POST", payload={"toolName": tool, "args": args, "sessionId": self.connection})
        if result.get("error"):
            raise ValueError("BROWSER_TOOL_REJECTED")
        if not isinstance(result.get("data"), dict):
            raise ValueError("INVALID_BRIDGE_RESPONSE")
        return result["data"]

    def bind(self, bound: int | None, allow_new: bool) -> int:
        data = self.call("browser_find_tab", {"urlContains": self.c["conversation_url"]})
        matches = []
        for tab in data.get("tabs", []):
            try:
                if conversation_url(tab.get("url", "")) == self.c["conversation_url"]:
                    matches.append(tab)
            except ValueError:
                pass
        if bound is not None:
            match = next((t for t in matches if t["tabId"] == bound), None)
            if match is None:
                raise ValueError("BOUND_TAB_MISSING")
        elif len(matches) > 1:
            raise ValueError("AMBIGUOUS_TABS")
        elif matches:
            match = matches[0]
        elif allow_new:
            match = self.call("browser_new_tab", {"url": self.c["conversation_url"]})
        else:
            raise ValueError("BOUND_TAB_MISSING")
        self.call("browser_select_tab", {"tabId": match["tabId"]})
        return match["tabId"]


def decode_image(data: bytes, minimum: tuple[int, int] = (1, 1)) -> dict:
    if not 0 < len(data) <= MAX_BYTES:
        raise ValueError("INVALID_IMAGE_SIZE")
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        with Image.open(io.BytesIO(data)) as image:
            fmt, (width, height) = image.format, image.size
            if fmt not in {"PNG", "JPEG", "WEBP"} or width * height > 40_000_000:
                raise ValueError("UNSUPPORTED_IMAGE")
            if width < minimum[0] or height < minimum[1] or getattr(image, "n_frames", 1) != 1:
                raise ValueError("IMAGE_DIMENSIONS_OR_FRAMES")
            image.verify()
        with Image.open(io.BytesIO(data)) as image:
            image.load()
    return {"sha256": digest(data), "bytes": len(data), "width": width, "height": height,
            "extension": {"PNG": "png", "JPEG": "jpg", "WEBP": "webp"}[fmt], "mime": Image.MIME[fmt]}


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("wb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(path)


@contextmanager
def process_lock(root: str):
    Path(root).mkdir(parents=True, exist_ok=True, mode=0o700)
    with (Path(root) / "runner.lock").open("a+b") as stream:
        stream.seek(0)
        stream.write(b"0")
        stream.flush()
        stream.seek(0)
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            if os.name == "nt":
                stream.seek(0)
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(stream, fcntl.LOCK_UN)
