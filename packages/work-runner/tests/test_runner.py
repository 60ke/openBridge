import base64
import copy
import io
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch

from PIL import Image
from core import (Bridge, Store, config, contained, conversation_url, decode_image,
                  digest, endpoint, process_lock, request, validate_job)
from runner import Backend, Runner, candidate
from main import make_server


def png(width=256, height=256):
    out = io.BytesIO()
    Image.new('RGB', (width, height)).save(out, 'PNG')
    return out.getvalue()


class FakeBridge:
    def __init__(self, root):
        self.calls = []
        self.root = root
        self.observation = {'conversationUrl': 'https://chatgpt.com/c/test-id', 'ready': True,
            'modeMatched': True, 'busy': False, 'blocked': None, 'humanIntervention': False,
            'anchorFound': False, 'observationComplete': True, 'draft': '', 'attachmentCount': 0,
            'uploadsReady': True, 'completionEvidence': None, 'artifacts': []}
        self.uncertain = False
        self.downloads = 0

    def connect(self):
        pass

    def bind(self, bound, allow_new):
        return 10

    def call(self, tool, args):
        self.calls.append(tool)
        if tool == 'chatgpt_work_observe':
            return copy.deepcopy(self.observation)
        if tool == 'chatgpt_work_prepare':
            self.observation['draft'] = args['text']
            return {'prepared': True}
        if tool == 'chatgpt_work_submit':
            self.observation.update(draft='', anchorFound=True)
            if self.uncertain:
                raise ConnectionError('response lost AFTER submission')
            return {'clicked': True}
        if tool == 'chatgpt_work_capture':
            return {'artifactKey': args['artifactKey'], 'coverage': 'asset', 'base64': base64.b64encode(png()).decode()}
        if tool == 'browser_download_begin':
            self.downloads += 1
            return {'state': 'in_progress'}
        if tool == 'browser_download_status':
            path = self.root / 'result.png'
            path.write_bytes(png())
            return {'state': 'complete', 'danger': 'safe', 'filename': str(path), 'downloadId': 7}
        raise AssertionError(tool)


class FakeBackend:
    def __init__(self):
        self.events = []
        self.fail_callback = False
        self.uploads = 0
        self.fail_upload = False

    def heartbeat(self, record):
        pass

    def visual(self, record):
        return {'decision': 'uncertain', 'reason': 'human required'}

    def upload(self, record, artifact):
        self.uploads += 1
        if self.fail_upload:
            raise ConnectionError('upload unavailable')
        return {'uri': 'https://storage.example/result.png', 'sha256': artifact['file']['sha256']}

    def call(self, path, payload=None, **kwargs):
        self.events.append(payload)
        if self.fail_callback:
            raise ConnectionError('callback unavailable')
        return {'accepted': True, 'event_id': payload['event_id']}


class RunnerTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.c = {'data_dir': str(self.root/'data'), 'input_root': str(self.root), 'download_root': str(self.root),
            'conversation_url': 'https://chatgpt.com/c/test-id', 'mode_pattern': 'Work', 'selectors': {},
            'timeout_seconds': 10000, 'stable_seconds': 0, 'poll_seconds': 1, 'backend_url': None}
        self.store = Store(self.c['data_dir'])
        self.bridge = FakeBridge(self.root)
        self.backend = FakeBackend()
        self.runner = Runner(self.c, self.store, self.bridge, self.backend)
        self.job = {'job_id': 'test-1', 'prompt': 'Generate one image', 'expected_images': 1}

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def get(self):
        return self.store.get('test-1')

    def ready_result(self):
        self.runner.enqueue(self.job)
        self.runner.tick()  # prepare
        self.runner.tick()  # send, intent persisted
        self.runner.tick()  # reconcile submitted message
        token = self.get()['attempt_id']
        self.bridge.observation.update(completionEvidence='reply_marker', replyText='done',
            artifacts=[{'key': token+'-0', 'loaded': True, 'downloadable': True, 'width': 256,
                'height': 256, 'sourceIdentity': 'synthetic-image'}])
        self.runner.tick()  # first candidate
        self.runner.tick()  # stable, capture and recheck
        self.runner.tick()  # no visual endpoint => human
        self.assertEqual(self.get()['phase'], 'awaiting_visual')

    def approve(self):
        record = self.get()
        self.runner.approve('test-1', {'candidate_digest': record['candidate_digest'],
            'evidence_hashes': [x['sha256'] for x in record['evidence']], 'decision': 'passed', 'reason': 'Fixture reviewed'})

    def test_idempotent_job(self):
        first = self.runner.enqueue(self.job)
        self.assertEqual(first['attempt_id'], self.runner.enqueue(self.job)['attempt_id'])
        with self.assertRaisesRegex(ValueError, 'IDEMPOTENCY_CONFLICT'):
            self.runner.enqueue({**self.job, 'prompt': 'different'})

    def test_draft_never_overwritten(self):
        self.runner.enqueue(self.job)
        self.bridge.observation['draft'] = 'user draft'
        self.runner.tick()
        self.assertEqual(self.get()['phase'], 'needs_human')
        self.assertNotIn('chatgpt_work_prepare', self.bridge.calls)

    def test_unknown_mode_not_sent(self):
        self.runner.enqueue(self.job)
        self.bridge.observation['modeMatched'] = False
        self.runner.tick()
        self.assertEqual(self.get()['phase'], 'needs_human')

    def test_uncertain_submission_not_resent(self):
        self.runner.enqueue(self.job)
        self.runner.tick()
        self.bridge.uncertain = True
        self.runner.tick()
        self.assertEqual(self.get()['phase'], 'submitting')
        r = self.get(); r['retry_at'] = 0; self.store.save(r)
        recovered = Runner(self.c, self.store, self.bridge, self.backend)
        recovered.tick()
        self.assertEqual(self.get()['phase'], 'running')
        self.assertEqual(self.bridge.calls.count('chatgpt_work_submit'), 1)

    def test_missing_message_is_not_success(self):
        self.runner.enqueue(self.job)
        self.runner.tick(); self.runner.tick()
        self.bridge.observation['anchorFound'] = False
        r = self.get(); r['sent_at'] = time.time()-100; self.store.save(r)
        self.runner.tick()
        self.assertIn('SUBMISSION_UNCERTAIN', self.get()['reason'])
        self.assertEqual(self.bridge.calls.count('chatgpt_work_submit'), 1)

    def test_visual_review_is_required(self):
        self.ready_result()
        self.assertEqual(self.bridge.downloads, 0)

    def test_stale_review_rejected(self):
        self.ready_result()
        with self.assertRaises(ValueError):
            self.runner.approve('test-1', {'candidate_digest': 'old', 'evidence_hashes': [], 'decision': 'passed', 'reason': 'x'})

    def test_modified_evidence_rejected(self):
        self.ready_result()
        Path(self.get()['evidence'][0]['path']).write_bytes(b'modified')
        with self.assertRaisesRegex(ValueError, 'EVIDENCE_FILE_CHANGED'):
            self.approve()

    def test_changed_result_after_review(self):
        self.ready_result(); self.approve()
        self.bridge.observation['replyText'] = 'different version'
        self.runner.tick()
        self.assertEqual(self.get()['phase'], 'needs_human')
        self.assertEqual(self.bridge.downloads, 0)

    def test_local_full_flow_no_fake_callback(self):
        self.ready_result(); self.approve()
        for _ in range(5): self.runner.tick()
        self.assertEqual(self.get()['phase'], 'local_complete')
        self.assertEqual(len(self.get()['artifacts']), 1)
        self.assertEqual(self.backend.events, [])
        self.assertEqual(self.get()['artifacts'][0]['file']['sha256'], digest(png()))

    def test_callback_failure_not_regeneration(self):
        self.c['backend_url'] = 'https://api.example'
        self.ready_result(); self.approve()
        self.backend.fail_callback = True
        for _ in range(6): self.runner.tick()
        self.assertEqual(self.get()['phase'], 'callback_pending')
        count = self.bridge.calls.count('chatgpt_work_submit')
        self.backend.fail_callback = False
        self.store.db.execute('UPDATE outbox SET due=0'); self.store.db.commit()
        self.runner.tick()
        self.assertEqual(self.get()['phase'], 'succeeded')
        self.assertEqual(self.bridge.calls.count('chatgpt_work_submit'), count)
        self.assertEqual(self.backend.uploads, 1)

    def test_upload_failure_not_regeneration(self):
        self.c['backend_url'] = 'https://api.example'
        self.ready_result(); self.approve()
        for _ in range(3): self.runner.tick()
        self.backend.fail_upload = True
        self.runner.tick()
        self.assertEqual(self.get()['phase'], 'uploading')
        self.backend.fail_upload = False
        r = self.get(); r['retry_at'] = 0; self.store.save(r)
        for _ in range(3): self.runner.tick()
        self.assertEqual(self.get()['phase'], 'succeeded')
        self.assertEqual(self.bridge.calls.count('chatgpt_work_submit'), 1)

    def test_candidate_excludes_unattributed_images(self):
        r = self.runner.enqueue(self.job)
        o = copy.deepcopy(self.bridge.observation)
        o.update(completionEvidence='done', artifacts=[{'loaded':True,'downloadable':True}])
        self.assertIsNone(candidate(o, r))

    def test_unknown_busy_not_complete(self):
        r = self.runner.enqueue(self.job)
        o = copy.deepcopy(self.bridge.observation)
        o.update(anchorFound=True, busy=None, completionEvidence='done', artifacts=[{'loaded':True,'downloadable':True}])
        self.assertIsNone(candidate(o, r))

    def test_human_intervention_stops(self):
        self.runner.enqueue(self.job)
        self.bridge.observation['humanIntervention'] = True
        self.runner.tick()
        self.assertEqual(self.get()['phase'], 'needs_human')

    def test_database_survives_reopen(self):
        before = self.runner.enqueue(self.job)
        self.store.close()
        self.store = Store(self.c['data_dir'])
        self.assertEqual(self.get()['attempt_id'], before['attempt_id'])

    def test_local_api_authorization(self):
        server = make_server(self.runner, 'x'*40, 0)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        url = f'http://127.0.0.1:{server.server_port}/v1/jobs'
        try:
            with self.assertRaises(urllib.error.HTTPError): request(url)
            with self.assertRaises(urllib.error.HTTPError): request(url, token='x'*40, headers={'Origin':'https://evil.example'})
            answer = request(url, method='POST', payload=self.job, token='x'*40)
            self.assertEqual(answer['job_id'], 'test-1')
            self.assertEqual(request(url, token='x'*40)['jobs'][0]['phase'], 'queued')
        finally:
            server.shutdown(); server.server_close(); thread.join()

    def test_no_outside_input_paths(self):
        outside = self.root.parent/'outside.png'
        with self.assertRaises(ValueError):
            validate_job({**self.job,'input_paths':[str(outside)]}, self.c)

    def test_unknown_job_callback_field_rejected(self):
        with self.assertRaises(ValueError):
            self.runner.enqueue({**self.job, 'callback_url':'https://evil.example'})

    def test_process_lock(self):
        with process_lock(self.c['data_dir']):
            with self.assertRaises(OSError):
                with process_lock(self.c['data_dir']): pass

    def test_endpoint_restrictions(self):
        self.assertEqual(endpoint('http://127.0.0.1:10088/'), 'http://127.0.0.1:10088')
        for u in ['http://example.com', 'https://secret@example.com', 'file:///tmp/x']:
            with self.assertRaises(ValueError): endpoint(u)

    def test_exact_conversation(self):
        self.assertEqual(conversation_url('https://chatgpt.com/c/test-id/'), 'https://chatgpt.com/c/test-id')
        for u in ['https://chatgpt.com.evil.example/c/test-id', 'https://chatgpt.com/share/test-id', 'https://chatgpt.com/c/test-id?x=1']:
            with self.assertRaises(ValueError): conversation_url(u)

    def test_decode_real_png_and_jpeg(self):
        self.assertEqual(decode_image(png())['mime'], 'image/png')
        out=io.BytesIO(); Image.new('RGB',(256,256)).save(out,'JPEG')
        self.assertEqual(decode_image(out.getvalue())['extension'], 'jpg')

    def test_reject_fake_image(self):
        with self.assertRaises((ValueError, OSError)): decode_image(b'<html>login</html>')
        with self.assertRaises((ValueError, OSError)): decode_image(png()[:40])
        with self.assertRaises(ValueError): decode_image(png(64,64),(256,256))

    def test_duplicate_tabs_not_random_choice(self):
        bridge=Bridge({'conversation_url': self.c['conversation_url']})
        with patch.object(bridge,'call', return_value={'tabs':[{'url':self.c['conversation_url'],'tabId':1},{'url':self.c['conversation_url'],'tabId':2}]}):
            with self.assertRaisesRegex(ValueError,'AMBIGUOUS_TABS'): bridge.bind(None,True)

    def test_callback_redacts_local_paths(self):
        self.c['backend_url']='https://api.example'
        self.ready_result(); self.approve()
        for _ in range(6): self.runner.tick()
        body = json.dumps(self.backend.events)
        self.assertNotIn(str(self.root), body)
        self.assertNotIn('lease_token', body)


if __name__ == '__main__':
    unittest.main()
