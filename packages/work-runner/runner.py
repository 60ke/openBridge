"""One browser/one conversation/one active job. No private ChatGPT API calls."""
from __future__ import annotations

import base64
import json
import os
import threading
import time
import urllib.error
from pathlib import Path

from core import (MAX_BYTES, Bridge, Store, atomic_write, contained, decode_image,
                  digest, endpoint, request, validate_job)


class Backend:
    def __init__(self, c: dict):
        self.c = c

    def call(self, path: str, payload=None, raw=None, method="POST", headers=None):
        token = os.environ.get(self.c.get("backend_token_env", "WORK_BACKEND_TOKEN"))
        if not self.c.get("backend_url") or not token:
            raise ValueError("BACKEND_CONFIGURATION_REQUIRED")
        return request(self.c["backend_url"] + path, method=method, payload=payload,
                       raw=raw, token=token, headers=headers, limit=1024 * 1024)

    def heartbeat(self, r):
        if r.get("lease_token"):
            reply = self.call(f'/v1/jobs/{r["job"]["job_id"]}/heartbeat', {
                "attempt_id": r["attempt_id"], "lease_token": r["lease_token"], "phase": r["phase"]})
            if reply.get("valid") is not True:
                raise ValueError("LEASE_NOT_VALID")

    def visual(self, r):
        hashes = [x["sha256"] for x in r["evidence"]]
        if not self.c.get("visual_url"):
            return {"decision": "uncertain", "reason": "Manual review required"}
        data = {"job_id": r["job"]["job_id"], "attempt_id": r["attempt_id"],
                "candidate_digest": r["candidate_digest"], "evidence_hashes": hashes,
                "expected_images": r["job"]["expected_images"],
                "screenshots": [{"sha256": e["sha256"], "artifact_key": e["key"],
                    "base64": base64.b64encode(Path(e["path"]).read_bytes()).decode()} for e in r["evidence"]]}
        for evidence in r["evidence"]:
            if digest(Path(evidence["path"]).read_bytes()) != evidence["sha256"]:
                raise ValueError("EVIDENCE_FILE_CHANGED")
        result = request(self.c["visual_url"], method="POST", payload=data,
                         token=os.environ.get(self.c.get("visual_token_env", "WORK_VISUAL_TOKEN")), limit=65536)
        if (result.get("candidate_digest") != data["candidate_digest"] or result.get("evidence_hashes") != hashes
                or result.get("decision") not in {"passed", "failed", "uncertain"}
                or not isinstance(result.get("reason"), str) or not result["reason"].strip()):
            raise ValueError("VISUAL_EVIDENCE_MISMATCH")
        return {"decision": result["decision"], "reason": result["reason"][:2000], "source": "visual_endpoint",
                "candidate_digest": data["candidate_digest"], "evidence_hashes": hashes}

    def upload(self, r, artifact):
        data = Path(artifact["path"]).read_bytes()
        if digest(data) != artifact["file"]["sha256"]:
            raise ValueError("ARCHIVED_FILE_CHANGED")
        file = artifact["file"]
        receipt = self.call(f'/v1/jobs/{r["job"]["job_id"]}/attempts/{r["attempt_id"]}/artifacts/{file["sha256"]}',
            raw=data, method="PUT", headers={"Content-Type": file["mime"], "X-Content-SHA256": file["sha256"],
            "Idempotency-Key": r["attempt_id"] + ":" + file["sha256"]})
        if receipt.get("sha256") != file["sha256"]:
            raise ValueError("UPLOAD_HASH_MISMATCH")
        endpoint(receipt.get("uri", ""))
        return {"sha256": receipt["sha256"], "uri": receipt["uri"]}


def candidate(o: dict, r: dict) -> str | None:
    if (o.get("anchorFound") is not True or o.get("observationComplete") is not True
            or o.get("ready") is not True or o.get("modeMatched") is not True
            or o.get("busy") is not False or o.get("blocked") or o.get("humanIntervention")
            or not o.get("completionEvidence")):
        return None
    assets = o.get("artifacts", [])
    if len(assets) != r["job"]["expected_images"] or any(not a.get("loaded") or not a.get("downloadable") for a in assets):
        return None
    return digest({"reply": o.get("replyText"), "assets": assets, "completion": o["completionEvidence"]})


class Runner:
    def __init__(self, c: dict, store: Store, bridge=None, backend=None):
        self.c, self.store = c, store
        self.bridge, self.backend = bridge or Bridge(c), backend or Backend(c)
        self.lock = threading.RLock()

    def enqueue(self, job, lease=None):
        with self.lock:
            return self.store.add(validate_job(job, self.c), lease)

    def pause(self, r, reason):
        r["resume_phase"] = r["phase"]
        r["phase"], r["reason"] = "needs_human", reason
        self.store.save(r)
        if self.c.get("backend_url"):
            self.store.event(r, "needs_human", reason=reason)

    def approve(self, job_id, payload):
        with self.lock:
            r = self.store.get(job_id)
            if not r or r["phase"] != "awaiting_visual":
                raise ValueError("NOT_AWAITING_VISUAL")
            expected = [x["sha256"] for x in r["evidence"]]
            if (payload.get("candidate_digest") != r["candidate_digest"] or payload.get("evidence_hashes") != expected
                    or payload.get("decision") not in {"passed", "failed"} or not payload.get("reason", "").strip()):
                raise ValueError("REVIEW_EVIDENCE_MISMATCH")
            for evidence in r["evidence"]:
                if digest(Path(evidence["path"]).read_bytes()) != evidence["sha256"]:
                    raise ValueError("EVIDENCE_FILE_CHANGED")
            r["review"] = {"decision": payload["decision"], "reason": payload["reason"][:2000], "source": "manual",
                           "candidate_digest": r["candidate_digest"], "evidence_hashes": expected}
            r["phase"] = "reviewed"
            self.store.save(r)

    def resume(self, job_id):
        with self.lock:
            r = self.store.get(job_id)
            if not r or r["phase"] != "needs_human":
                raise ValueError("NOT_PAUSED")
            r["phase"] = r["resume_phase"]
            # Never rewind submitting to prepared: uncertain sends must be reconciled.
            r.pop("reason", None)
            self.store.save(r)

    def flush(self):
        if not self.c.get("backend_url"):
            return
        for item in self.store.pending():
            try:
                body = json.loads(item["body"])
                result = self.backend.call(f'/v1/jobs/{body["job_id"]}/events', payload=body)
                if result.get("accepted") is not True or result.get("event_id") != body["event_id"]:
                    raise ValueError("CALLBACK_ACK_MISMATCH")
                # Mark the job before marking the outbox, allowing harmless duplicate retries after crashes.
                r = self.store.get(body["job_id"])
                if body["status"] == "succeeded" and r and r["phase"] == "callback_pending":
                    r["phase"] = "succeeded"
                    self.store.save(r)
                self.store.acknowledge(item["id"])
            except (OSError, ValueError):
                self.store.defer(item)

    def tick(self):
        with self.lock:
            self.flush()
            r = self.store.active()
            if not r and self.c.get("claim_remote"):
                response = self.backend.call(f'/v1/runners/{self.c["runner_id"]}/claim', payload={})
                if response.get("job"):
                    lease = response.get("lease_token")
                    if not isinstance(lease, str) or not lease:
                        raise ValueError("LEASE_REQUIRED")
                    r = self.enqueue(response["job"], lease)
            if not r or r["phase"] == "callback_pending":
                return
            if r["phase"] in {"needs_human", "awaiting_visual"}:
                try:
                    self.backend.heartbeat(r)
                except (OSError, ValueError):
                    r["last_error"] = "PAUSED_LEASE_REQUIRES_RECONCILIATION"
                    self.store.save(r)
                return
            if time.time() < r.get("retry_at", 0):
                return
            try:
                self.backend.heartbeat(r)
                self.step(r)
            except urllib.error.HTTPError as error:
                if error.code in {408, 429} or error.code >= 500:
                    r["retry_at"] = time.time() + 30
                    r["last_error"] = "HTTP_" + str(error.code)
                    self.store.save(r)
                else:
                    self.pause(r, "HTTP_" + str(error.code))
            except (ConnectionError, TimeoutError, urllib.error.URLError):
                r["retry_at"], r["last_error"] = time.time() + 15, "CONNECTION_UNAVAILABLE"
                self.store.save(r)
            except (ValueError, OSError, KeyError, TypeError) as error:
                # No URLs, page text, tokens, or request bodies in external error events.
                code = str(error)
                self.pause(r, code if code.isascii() and code.replace("_", "").isalnum() and len(code) < 100 else type(error).__name__)

    def args(self, r):
        return {"tabId": r["tab_id"], "conversationUrl": self.c["conversation_url"], "token": r["attempt_id"],
                "modePattern": self.c["mode_pattern"], "selectors": self.c.get("selectors", {})}

    def observe(self, r):
        o = self.bridge.call("chatgpt_work_observe", self.args(r))
        if o.get("conversationUrl") != self.c["conversation_url"]:
            raise ValueError("WRONG_CONVERSATION")
        if o.get("humanIntervention") or o.get("blocked"):
            raise ValueError("PAGE_NEEDS_ATTENTION")
        return o

    def step(self, r):
        phase, job = r["phase"], r["job"]
        directory = Path(self.c["data_dir"]) / "jobs" / job["job_id"] / r["attempt_id"]
        if phase == "uploading":
            for a in r["artifacts"]:
                if self.c.get("backend_url") and not a.get("receipt"):
                    a["receipt"] = self.backend.upload(r, a)
                    self.store.save(r)
                    return
            manifest = {"job_id": job["job_id"], "attempt_id": r["attempt_id"], "input_version": job.get("input_version"),
                "candidate_digest": r["candidate_digest"], "visual_review": r["review"],
                "artifacts": [{"key": a["key"], **a["file"], **a.get("receipt", {})} for a in r["artifacts"]]}
            atomic_write(directory / "manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2).encode())
            if self.c.get("backend_url"):
                self.store.event(r, "succeeded", manifest=manifest)
                r["phase"] = "callback_pending"
            else:
                r["phase"] = "local_complete"
            self.store.save(r)
            return
        self.bridge.connect()
        r["tab_id"] = self.bridge.bind(r.get("tab_id", self.c.get("tab_id")), allow_new=phase == "queued")
        self.store.save(r)
        o = self.observe(r)
        args = self.args(r)
        if phase == "queued":
            if not o.get("ready"):
                return
            if not o.get("modeMatched") or o.get("busy") is not False or o.get("draft") or o.get("attachmentCount"):
                raise ValueError("PAGE_NOT_READY_OR_DRAFT_PRESENT")
            if o.get("anchorFound"):
                raise ValueError("UNEXPECTED_EXISTING_ATTEMPT")
            validate_job(job, self.c)
            r["text"] = (f'[openbridge-job:{r["attempt_id"]}]\n' + job["prompt"].strip() +
                f'\n\nAfter producing the requested original downloadable images, include [openbridge-done:{r["attempt_id"]}] in your final reply. Do not include this marker inside the image.')
            r["phase"] = "preparing"
            self.store.save(r)
            self.bridge.call("chatgpt_work_prepare", {**args, "text": r["text"], "paths": job["input_paths"]})
            r["phase"] = "prepared"
            self.store.save(r)
            return
        if phase == "preparing":
            if o.get("draft") != r["text"]:
                raise ValueError("PREPARATION_UNCERTAIN_NO_AUTOMATIC_RETRY")
            r["phase"] = "prepared"
            self.store.save(r)
            return
        if phase == "prepared":
            if not o.get("uploadsReady"):
                return
            if o.get("draft") != r["text"] or o.get("attachmentCount") != len(job["input_paths"]):
                raise ValueError("DRAFT_OR_ATTACHMENT_MISMATCH")
            r["phase"], r["sent_at"] = "submitting", time.time()
            self.store.save(r)
            self.bridge.call("chatgpt_work_submit", {**args, "text": r["text"], "attachmentCount": len(job["input_paths"])})
            return
        if phase == "submitting":
            if o.get("anchorFound"):
                r["phase"] = "running"
                self.store.save(r)
            elif time.time() - r["sent_at"] > 60:
                raise ValueError("SUBMISSION_UNCERTAIN_NO_AUTOMATIC_RESEND")
            return
        if phase == "running":
            if time.time() - r["sent_at"] > self.c["timeout_seconds"]:
                raise ValueError("TASK_TIMEOUT_RECONCILE_REQUIRED")
            key = candidate(o, r)
            if not key:
                r.pop("candidate_digest", None)
                self.store.save(r)
                return
            if r.get("candidate_digest") != key:
                r["candidate_digest"], r["candidate_since"] = key, time.time()
                self.store.save(r)
                return
            if time.time() - r["candidate_since"] < self.c["stable_seconds"]:
                return
            evidence = []
            for a in o["artifacts"]:
                image = self.bridge.call("chatgpt_work_capture", {**args, "artifactKey": a["key"]})
                if image.get("coverage") != "asset" or image.get("artifactKey") != a["key"]:
                    raise ValueError("SCREENSHOT_COVERAGE_UNKNOWN")
                raw = base64.b64decode(image["base64"], validate=True)
                info = decode_image(raw)
                path = directory / ("evidence-" + str(len(evidence)) + ".png")
                atomic_write(path, raw)
                evidence.append({"key": a["key"], "sha256": info["sha256"], "path": str(path)})
            if candidate(self.observe(r), r) != key:
                raise ValueError("RESULT_CHANGED_DURING_CAPTURE")
            r["evidence"], r["phase"] = evidence, "verifying"
            r["candidate_assets"] = o["artifacts"]
            self.store.save(r)
            return
        if phase in {"verifying", "reviewed", "downloading"}:
            if candidate(o, r) != r["candidate_digest"]:
                raise ValueError("RESULT_CHANGED_AFTER_CAPTURE")
        if phase == "verifying":
            r["review"] = self.backend.visual(r)
            r["phase"] = "awaiting_visual" if r["review"]["decision"] == "uncertain" else "reviewed"
            self.store.save(r)
            return
        if phase == "reviewed":
            if r["review"]["decision"] != "passed":
                raise ValueError("VISUAL_REVIEW_FAILED")
            r["phase"] = "downloading"
            self.store.save(r)
            return
        if phase == "downloading":
            i = len(r["artifacts"])
            if i == job["expected_images"]:
                r["phase"] = "uploading"
                self.store.save(r)
                return
            a = r["candidate_assets"][i]
            operation = {**args, "operationId": f'{r["attempt_id"]}-{i}', "artifactKey": a["key"]}
            self.bridge.call("browser_download_begin", operation)
            item = self.bridge.call("browser_download_status", operation)
            if item.get("state") in {"intent", "in_progress", "waiting_native"}:
                return
            if item.get("state") != "complete" or item.get("danger") not in {"safe", "accepted", "allowlistedByPolicy", "deepScannedSafe"}:
                raise ValueError("DOWNLOAD_NOT_CONFIRMED")
            path = contained(self.c["download_root"], item["filename"])
            if not path.is_file() or not 0 < path.stat().st_size <= MAX_BYTES:
                raise ValueError("DOWNLOADED_FILE_INVALID")
            with path.open("rb") as stream:
                raw = stream.read(MAX_BYTES + 1)
            info = decode_image(raw, (job["min_width"], job["min_height"]))
            if any(x["file"]["sha256"] == info["sha256"] for x in r["artifacts"]):
                raise ValueError("DUPLICATE_IMAGE_REQUIRES_REVIEW")
            target = directory / f'original-{i}.{info["extension"]}'
            atomic_write(target, raw)
            r["artifacts"].append({"key": a["key"], "download_id": item["downloadId"], "file": info, "path": str(target)})
            self.store.save(r)
            return
        raise ValueError("UNKNOWN_PHASE")
