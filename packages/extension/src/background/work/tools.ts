import type { ToolHandler } from '../command-router';
import { observeWorkPage } from './observe';

type Args = Record<string, any>;
const locks = new Map<number, Promise<unknown>>();
const TOKEN = /^[a-f0-9]{32}$/;
const OPERATION = /^[a-f0-9]{32}-\d{1,2}$/;

function canonical(value: string): string {
  const u = new URL(value);
  if (u.origin !== 'https://chatgpt.com' || u.username || u.password || !/^\/c\/[a-zA-Z0-9-]+\/?$/.test(u.pathname)) throw new Error('Invalid conversation URL');
  return u.origin + u.pathname.replace(/\/$/, '');
}

async function guard(args: Args, downloading = false): Promise<void> {
  if (!Number.isInteger(args.tabId) || !TOKEN.test(args.token || '')) throw new Error('Explicit tabId and attempt token required');
  const expected = canonical(args.conversationUrl);
  const { workRunnerPolicy: policy } = await chrome.storage.local.get('workRunnerPolicy');
  if (!policy?.enabled || canonical(policy.conversationUrl || '') !== expected || (downloading && !policy.allowDownloads)) {
    throw new Error('Enable this exact conversation in OpenBridge Work settings first');
  }
  if (canonical((await chrome.tabs.get(args.tabId)).url || '') !== expected) throw new Error('Target tab navigated away');
}

async function command(args: Args, method: string, params: object = {}) {
  await guard(args);
  return chrome.debugger.sendCommand({ tabId: args.tabId }, method, params);
}

async function evaluate(args: Args, fn: (...params: any[]) => any, data: any): Promise<any> {
  const expression = `(() => { if (location.origin + location.pathname.replace(/\\/$/, '') !== ${JSON.stringify(canonical(args.conversationUrl))}) throw new Error('Navigation race'); return (${fn.toString()})(${JSON.stringify(data)}); })()`;
  const r = await command(args, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'Page observation failed');
  return r.result?.value;
}

async function observe(args: Args) { return evaluate(args, observeWorkPage, args); }

function strictReady(o: Args) {
  if (!o.ready || !o.modeMatched || o.busy !== false || o.blocked || o.humanIntervention) throw new Error('Page not ready or needs user attention');
}

async function prepare(args: Args) {
  const o = await observe(args); strictReady(o);
  if (o.anchorFound) return { alreadySubmitted: true };
  if (!args.text?.includes('[openbridge-job:' + args.token + ']') || args.text.length > 100_000) throw new Error('Invalid task text');
  if (o.draft || o.attachmentCount) throw new Error('Will not overwrite a draft or pre-existing attachments');
  const paths = args.paths || [];
  if (!Array.isArray(paths) || paths.length > 10 || paths.some((p: any) => typeof p !== 'string')) throw new Error('Invalid input paths');
  if (paths.length) {
    const doc = await command(args, 'DOM.getDocument');
    const found = await command(args, 'DOM.querySelector', { nodeId: doc.root.nodeId, selector: args.selectors?.fileInput || 'input[type="file"]' });
    if (!found.nodeId) throw new Error('Open the file attachment UI, then calibrate fileInput selector');
    await command(args, 'DOM.setFileInputFiles', { nodeId: found.nodeId, files: paths });
  }
  await evaluate(args, (a: Args) => {
    const el = document.querySelector(a.composer) as HTMLElement;
    if (!el) throw new Error('Composer disappeared');
    el.focus();
  }, { composer: args.selectors?.composer || '#prompt-textarea, textarea[data-id="root"]' });
  await command(args, 'Input.insertText', { text: args.text });
  const after = await observe(args);
  if (after.draft !== args.text) throw new Error('Composer round-trip mismatch; send was NOT clicked');
  return { prepared: true };
}

async function submit(args: Args) {
  const o = await observe(args); strictReady(o);
  if (o.anchorFound) return { alreadySubmitted: true };
  if (o.draft !== args.text || !o.uploadsReady || o.attachmentCount !== args.attachmentCount) throw new Error('Draft or attachment mismatch');
  await evaluate(args, (a: Args) => {
    const composer = document.querySelector(a.composer) as HTMLElement | HTMLTextAreaElement;
    const text = composer instanceof HTMLTextAreaElement ? composer.value : composer?.innerText;
    if (text?.trim() !== a.text) throw new Error('Draft changed before send');
    const button = document.querySelector(a.send) as HTMLButtonElement;
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') throw new Error('Send button unavailable');
    button.click();
  }, { text: args.text, composer: args.selectors?.composer || '#prompt-textarea, textarea[data-id="root"]',
       send: args.selectors?.send || '[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="发送提示"]' });
  return { clicked: true, confirmed: false };
}

async function capture(args: Args) {
  const o = await observe(args);
  if (!o.anchorFound || o.blocked || o.humanIntervention || !o.artifacts.some((a: Args) => a.key === args.artifactKey)) throw new Error('Result anchor missing');
  const rect = await evaluate(args, async (a: Args) => {
    const img = document.querySelector(`[data-ob-work-image="${a.key}"]`) as HTMLImageElement;
    if (!img || !img.complete || !img.naturalWidth) throw new Error('Image not loaded');
    img.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    await new Promise(resolve => setTimeout(resolve, 100));
    const r = img.getBoundingClientRect();
    // Capture only the on-screen image rectangle, never claim an offscreen partial image is covered.
    if (r.x < 0 || r.y < 0 || r.right > innerWidth || r.bottom > innerHeight || r.width <= 0 || r.height <= 0) throw new Error('Image exceeds viewport; resize manually before review');
    return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height, scale: 1 };
  }, { key: args.artifactKey });
  const screenshot = await command(args, 'Page.captureScreenshot', { format: 'png', clip: rect, captureBeyondViewport: false });
  return { artifactKey: args.artifactKey, coverage: 'asset', base64: screenshot.data, mimeType: 'image/png' };
}

const downloadKey = (id: string) => 'workDownload:' + id;
function allowedAsset(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password &&
      (u.hostname === 'chatgpt.com' || u.hostname === 'oaiusercontent.com' || u.hostname.endsWith('.oaiusercontent.com'));
  } catch { return false; }
}

async function beginDownload(args: Args) {
  await guard(args, true);
  if (!OPERATION.test(args.operationId || '') || !args.operationId.startsWith(args.token + '-')) throw new Error('Invalid operation ID');
  const storageKey = downloadKey(args.operationId);
  const prior = (await chrome.storage.local.get(storageKey))[storageKey];
  if (prior) {
    if (prior.artifactKey !== args.artifactKey || prior.conversationUrl !== args.conversationUrl) throw new Error('Download idempotency conflict');
    return { operationId: args.operationId, state: prior.state };
  }
  const o = await observe(args);
  if (!o.anchorFound || o.busy || o.blocked || o.humanIntervention || !o.completionEvidence) throw new Error('Result is not ready for download');
  const asset = o.artifacts.find((a: Args) => a.key === args.artifactKey);
  if (!asset?.downloadable) throw new Error('No unambiguous original download action');
  const record: Args = { operationId: args.operationId, artifactKey: args.artifactKey,
    conversationUrl: args.conversationUrl, tabId: args.tabId, startTime: new Date().toISOString(), state: 'intent', name: asset.name };
  // Persist BEFORE the click/download. A restarted worker never repeats an uncertain native click.
  await chrome.storage.local.set({ [storageKey]: record });
  if (asset.href && allowedAsset(asset.href)) {
    const id = await chrome.downloads.download({ url: asset.href, saveAs: false, conflictAction: 'uniquify' });
    record.downloadId = id; record.state = 'in_progress'; record.method = 'direct-original-link';
  } else {
    await evaluate(args, (a: Args) => {
      const el = document.querySelector(`[data-ob-work-download="${a.key}"]`) as HTMLElement;
      if (!el) throw new Error('Download action disappeared');
      const href = el.getAttribute('href') || '';
      if (href && !href.startsWith('sandbox:') && !href.startsWith('blob:') && !(href.startsWith('/') && !href.startsWith('//'))) throw new Error('Unapproved download host');
      el.click();
    }, { key: args.artifactKey });
    record.state = 'waiting_native'; record.method = 'native-action';
  }
  await chrome.storage.local.set({ [storageKey]: record });
  return { operationId: args.operationId, state: record.state };
}

async function downloadStatus(args: Args) {
  await guard(args, true);
  if (!OPERATION.test(args.operationId || '') || !args.operationId.startsWith(args.token + '-')) throw new Error('Invalid operation ID');
  const storageKey = downloadKey(args.operationId), record = (await chrome.storage.local.get(storageKey))[storageKey];
  if (!record || record.conversationUrl !== args.conversationUrl) return { state: 'missing' };
  let item;
  if (record.downloadId !== undefined) item = (await chrome.downloads.search({ id: record.downloadId }))[0];
  else {
    const age = Date.now() - Date.parse(record.startTime);
    // A unique allowed-host download with a ChatGPT referrer during this action window.
    const all = await chrome.downloads.search({ startedAfter: record.startTime, limit: 30 });
    const matches = all.filter(d => {
      const t = Date.parse(d.startTime) - Date.parse(record.startTime);
      let ref = ''; try { ref = new URL(d.referrer || '').origin; } catch { /* reject */ }
      return t >= 0 && t <= 30_000 && ref === 'https://chatgpt.com' && allowedAsset(d.finalUrl || d.url);
    });
    if (matches.length > 1) return { state: 'ambiguous', reason: 'Multiple downloads match the native action window' };
    if (!matches.length) return { state: age > 35_000 ? 'needs_human' : 'waiting_native', reason: 'Cannot establish original-download ownership' };
    if (age < 1500) return { state: 'waiting_native' }; // collect near-simultaneous ambiguities before binding
    item = matches[0]; record.downloadId = item.id;
    await chrome.storage.local.set({ [storageKey]: record });
  }
  if (!item) return { state: 'missing' };
  return { state: item.state, downloadId: item.id, filename: item.filename, danger: item.danger,
    bytes: item.fileSize, reason: item.error, ownership: record.method };
}

const operations: Record<string, (a: Args) => Promise<any>> = {
  chatgpt_work_observe: observe, chatgpt_work_prepare: prepare, chatgpt_work_submit: submit,
  chatgpt_work_capture: capture, browser_download_begin: beginDownload, browser_download_status: downloadStatus,
};

export const workToolHandlers: ToolHandler[] = Object.entries(operations).map(([name, fn]) => ({
  name,
  async execute(args: Args) {
    // Pin every command to explicit tabId. Avoid an active-tab race with other clients.
    const previous = locks.get(args.tabId) || Promise.resolve();
    const task = previous.catch(() => {}).then(async () => { await guard(args); return { data: await fn(args) }; });
    locks.set(args.tabId, task);
    try { return await task; }
    catch (e) { return { error: { code: 'WORK_NEEDS_HUMAN', message: e instanceof Error ? e.message : String(e) } }; }
    finally { if (locks.get(args.tabId) === task) locks.delete(args.tabId); }
  },
}));
