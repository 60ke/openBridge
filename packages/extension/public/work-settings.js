/* Local options page only. No external requests, scripts, or telemetry. */
(async () => {
  const $ = id => document.getElementById(id);
  const current = (await chrome.storage.local.get('workRunnerPolicy')).workRunnerPolicy || {};
  $('url').value = current.conversationUrl || '';
  $('enabled').checked = current.enabled === true;
  $('downloads').checked = current.allowDownloads === true;
  $('save').addEventListener('click', async () => {
    try {
      const url = new URL($('url').value.trim());
      if (url.origin !== 'https://chatgpt.com' || url.username || url.password || !/^\/c\/[A-Za-z0-9-]+\/?$/.test(url.pathname)) throw new Error('请填写有效的 ChatGPT /c/ 会话地址');
      await chrome.storage.local.set({workRunnerPolicy: {
        enabled: $('enabled').checked, allowDownloads: $('downloads').checked,
        conversationUrl: url.origin + url.pathname.replace(/\/$/, ''), updatedAt: new Date().toISOString()
      }});
      $('result').textContent = '已保存。修改会话后，请同步修改 Runner 的本地配置。';
    } catch (e) { $('result').textContent = String(e); }
  });
})().catch(e => { document.getElementById('result').textContent = String(e); });
