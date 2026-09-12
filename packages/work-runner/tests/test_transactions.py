"""Crash-boundary and decompression-limit regression tests."""
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image
from core import Store, decode_image


class TransactionTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(self.temp.name)
        self.record = self.store.add({"job_id": "atomic-test", "prompt": "test"})

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def test_success_outbox_and_phase_commit_together(self):
        r = self.record
        r["phase"] = "uploading"
        self.store.save(r)
        event_id = self.store.event(r, "succeeded", manifest={"test": True})
        self.assertEqual(self.store.get("atomic-test")["phase"], "callback_pending")
        self.assertEqual(r["phase"], "callback_pending")
        self.assertEqual(self.store.pending()[0]["id"], event_id)
        self.store.close()
        self.store = Store(self.temp.name)
        self.assertEqual(self.store.get("atomic-test")["phase"], "callback_pending")
        self.assertEqual(len(self.store.pending()), 1)

    def test_success_outbox_rolls_back_on_transition_failure(self):
        self.store.db.execute("CREATE TRIGGER fail_job_update BEFORE UPDATE ON jobs BEGIN SELECT RAISE(ABORT, 'test failure'); END")
        self.store.db.commit()
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.event(self.record, "succeeded", manifest={})
        self.assertEqual(self.store.get("atomic-test")["phase"], "queued")
        self.assertEqual(self.record["phase"], "queued")
        self.assertEqual(self.store.pending(), [])

    def test_image_bomb_rejected_as_validation_error(self):
        with patch("core.Image.open", side_effect=Image.DecompressionBombError("too large")):
            with self.assertRaisesRegex(ValueError, "IMAGE_DECODE_LIMIT"):
                decode_image(b"synthetic input")
