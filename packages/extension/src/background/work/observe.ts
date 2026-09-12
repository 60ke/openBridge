/** Serialized into the page. Keep self-contained: no imports or closure variables. */
export function observeWorkPage(args: {
  conversationUrl: string; token: string; selectors?: Record<string, string>; modePattern?: string;
}): Record<string, any> {
  const selectors = {
    messages: '[data-message-author-role]',
    composer: '#prompt-textarea, textarea[data-id="root"]',
    send: '[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="发送提示"]',
    busy: '[data-testid="stop-button"], button[aria-label="Stop generating"], button[aria-label="停止生成"]',
    mode: '[data-testid="model-switcher-dropdown-button"], [data-testid="composer-mode-button"]',
    attachments: '[data-testid="composer-attachment"]',
    uploading: '[role="progressbar"], [aria-busy="true"]',
    blocked: '[role="alertdialog"], [role="dialog"], [role="alert"]',
    download: 'button[aria-label*="download" i], button[aria-label*="下载"], a[download]',
    ...args.selectors,
  };
  const visible = (e: Element) => {
    const b = e.getBoundingClientRect(), s = getComputedStyle(e);
    return b.width > 0 && b.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
  };
  const query = (root: ParentNode, css: string): Element[] => Array.from(root.querySelectorAll(css));
  const current = location.origin + location.pathname.replace(/\/$/, '');
  if (current !== args.conversationUrl) return { conversationUrl: current, blocked: 'wrong_conversation', observationComplete: false };
  const main = document.querySelector('main') || document.body;
  const composer = query(document, selectors.composer).find(visible) as HTMLElement | undefined;
  const composerArea = composer?.closest('form') || composer?.parentElement;
  const draft = composer instanceof HTMLTextAreaElement ? composer.value : composer?.innerText || '';
  const blocked = query(document, selectors.blocked).find(visible);
  const mode = query(document, selectors.mode).filter(visible).map(e => (e as HTMLElement).innerText || e.getAttribute('aria-label') || '').join(' ');
  let modeMatched = false;
  try { modeMatched = !!args.modePattern && !!mode && new RegExp(args.modePattern, 'i').test(mode); } catch { /* fail closed */ }
  const messages = query(main, selectors.messages).filter(e =>
    ['assistant', 'user'].includes(e.getAttribute('data-message-author-role') || ''));
  const marker = '[openbridge-job:' + args.token + ']';
  const anchorMatches = messages.filter(e => e.getAttribute('data-message-author-role') === 'user' && (e.textContent || '').includes(marker));
  const anchor = anchorMatches.length === 1 ? messages.indexOf(anchorMatches[0]) : -1;
  const subsequent = anchor < 0 ? [] : messages.slice(anchor + 1);
  const human = subsequent.some(e => e.getAttribute('data-message-author-role') === 'user');
  const replies = subsequent.filter(e => e.getAttribute('data-message-author-role') === 'assistant');
  const text = replies.map(e => (e as HTMLElement).innerText || '').join('\n');
  const busy = query(document, selectors.busy).some(visible);
  const assets: Record<string, any>[] = [];
  let ordinal = 0;
  const usedActions = new Set<Element>();
  for (const reply of replies) {
    for (const img of query(reply, 'img') as HTMLImageElement[]) {
      // Exclude icons; do not demand viewport intersection (long outputs can be below the fold).
      if (!visible(img) || (img.naturalWidth && img.naturalWidth < 128)) continue;
      let action: Element | null = null;
      const link = img.closest('a');
      if (link && (link.hasAttribute('download') || /\.(png|jpe?g|webp)([?#]|$)/i.test(link.getAttribute('href') || ''))) action = link;
      let scope: Element | null = img.parentElement;
      for (let depth = 0; !action && scope && depth < 4; depth++, scope = scope.parentElement) {
        if (!reply.contains(scope) && scope !== reply) break;
        const count = query(scope, 'img').filter(e => (e as HTMLImageElement).naturalWidth >= 128).length;
        if (count !== 1) break;
        const actions = query(scope, selectors.download + ', a[href]').filter(e =>
          e.hasAttribute('download') || /下载|download/i.test(e.getAttribute('aria-label') || e.textContent || '') ||
          /\.(png|jpe?g|webp)([?#]|$)/i.test(e.getAttribute('href') || ''));
        if (actions.length === 1) action = actions[0];
        if (actions.length > 1) break;
      }
      const key = args.token + '-' + ordinal++;
      const downloadable = !!action && !usedActions.has(action);
      img.setAttribute('data-ob-work-image', key);
      if (downloadable && action) { usedActions.add(action); action.setAttribute('data-ob-work-download', key); }
      const href = action?.getAttribute('href') || '';
      let name = action?.getAttribute('download') || action?.textContent?.trim() || '';
      if (name.length > 160) name = '';
      assets.push({ key, name, loaded: img.complete && img.naturalWidth > 0,
        width: img.naturalWidth, height: img.naturalHeight, downloadable,
        sourceIdentity: img.currentSrc || img.src, href });
    }
  }
  return { conversationUrl: current, ready: !!composer, mode, modeMatched,
    draft: draft.replace(/\r\n/g, '\n').trim(), busy: composer ? busy : null,
    blocked: blocked ? (blocked.textContent || 'visible_dialog').slice(0, 180) : null,
    attachmentCount: composerArea ? query(composerArea, selectors.attachments).length : 0,
    uploadsReady: !!composerArea && !query(composerArea, selectors.uploading).some(visible),
    anchorFound: anchor >= 0, humanIntervention: human,
    observationComplete: !!composer && (anchorMatches.length <= 1),
    completionEvidence: anchor >= 0 && !human && text.includes('[openbridge-done:' + args.token + ']') ? 'reply_marker' : null,
    replyText: text, artifacts: assets,
    messageIds: messages.map((e, i) => e.getAttribute('data-message-id') || e.id || 'visible-' + i),
    adapterVersion: 'chatgpt-dom-v1', observedAt: new Date().toISOString() };
}
