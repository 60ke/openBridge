const statusDot = document.getElementById("statusDot")!;
const connectionStatus = document.getElementById("connectionStatus")!;
const pairingInfo = document.getElementById("pairingInfo")!;
const evaluateToggle = document.getElementById("evaluateToggle") as HTMLInputElement;
const pauseToggle = document.getElementById("pauseToggle") as HTMLInputElement;
const cursorToggle = document.getElementById("cursorToggle") as HTMLInputElement;
const activityList = document.getElementById("activityList")!;
const managedTabsList = document.getElementById("managedTabsList")!;
const closeAllTabsBtn = document.getElementById("closeAllTabsBtn")!;
const footer = document.getElementById("footer")!;

const manifest = chrome.runtime.getManifest();
footer.textContent = `v${manifest.version}`;

async function send(message: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await chrome.runtime.sendMessage(message);
  return response ?? {};
}

async function updateStatus(): Promise<void> {
  try {
    const response = await send({ type: "getStatus" });
    const connected = response.connected === true;
    const transportConnected = response.transportConnected === true;
    const paired = response.paired === true;
    const hasStoredToken = response.hasStoredToken === true;
    const autoPairing = response.autoPairing === true;
    const url = response.url as string | undefined;

    if (transportConnected) {
      statusDot.classList.add("connected");
      if (paired) {
        connectionStatus.innerHTML = `<span class="url">Connected to ${url ?? "ws://127.0.0.1:10087"}</span>`;
      } else {
        connectionStatus.innerHTML = `<span class="url">Bridge reachable at ${url ?? "ws://127.0.0.1:10087"}</span>`;
      }
    } else {
      statusDot.classList.remove("connected");
      connectionStatus.innerHTML = `<span class="disconnected-text">Disconnected</span>`;
    }

    if (paired) {
      pairingInfo.innerHTML = `<span class="paired-text">Authorized ✓</span><button class="btn btn-danger" id="resetPairBtn">Reset</button>`;
      document.getElementById("resetPairBtn")!.addEventListener("click", handleResetPairing);
    } else if (transportConnected) {
      const label = autoPairing
        ? "Authorizing..."
        : hasStoredToken
          ? "Reconnecting..."
          : "Authorizing...";
      pairingInfo.innerHTML = `<span class="pending-text">${label}</span><button class="btn btn-secondary" id="reconnectBtn">Retry</button>`;
      document.getElementById("reconnectBtn")!.addEventListener("click", handleReconnect);
    } else {
      pairingInfo.innerHTML = `<span class="not-paired-text">Waiting for daemon</span><button class="btn btn-secondary" id="reconnectBtn">Retry</button>`;
      document.getElementById("reconnectBtn")!.addEventListener("click", handleReconnect);
    }
  } catch {
    statusDot.classList.remove("connected");
    connectionStatus.innerHTML = `<span class="disconnected-text">Disconnected</span>`;
  }
}

async function handleReconnect(): Promise<void> {
  const response = await send({ type: "pair" });
  if (response.success !== true && typeof response.error === "string") {
    console.warn(`[OpenBridge] Reconnect failed: ${response.error}`);
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  await updateStatus();
}

async function handleResetPairing(): Promise<void> {
  await send({ type: "resetPairing" });
  await updateStatus();
}

evaluateToggle.addEventListener("change", () => {
  send({ type: "toggleEvaluate", enabled: evaluateToggle.checked });
});

pauseToggle.addEventListener("change", () => {
  send({ type: "togglePause", paused: pauseToggle.checked });
});

cursorToggle.addEventListener("change", async () => {
  chrome.storage.local.set({ cursor_enabled: cursorToggle.checked });
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]?.id) {
    chrome.tabs.sendMessage(tabs[0].id, {
      type: cursorToggle.checked ? "enableCursor" : "disableCursor",
    }).catch(() => {});
  }
});

async function loadToggles(): Promise<void> {
  const result = await chrome.storage.local.get(["evaluate_enabled", "paused", "cursor_enabled"]);
  evaluateToggle.checked = !!result.evaluate_enabled;
  pauseToggle.checked = !!result.paused;
  cursorToggle.checked = !!result.cursor_enabled;
}

async function loadRecentActivity(): Promise<void> {
  const result = await chrome.storage.local.get(["recent_operations"]);
  const operations: Array<{ name: string; timestamp: number }> = result.recent_operations ?? [];
  const recent = operations.slice(-5).reverse();

  if (recent.length === 0) {
    activityList.innerHTML = `<div class="activity-empty">No recent activity</div>`;
    return;
  }

  activityList.innerHTML = recent
    .map(
      (op) =>
        `<div class="activity-item"><span class="name">${escapeHtml(op.name)}</span><span class="time">${formatTime(op.timestamp)}</span></div>`
    )
    .join("");
}

interface ManagedTab {
  tabId: number;
  url?: string;
  title?: string;
  label?: string;
}

async function loadManagedTabs(): Promise<void> {
  const response = await send({ type: "getManagedTabs" });
  const tabs = (response.tabs ?? []) as ManagedTab[];

  if (tabs.length === 0) {
    managedTabsList.innerHTML = `<div class="activity-empty">No tabs managed</div>`;
    closeAllTabsBtn.style.display = "none";
    return;
  }

  closeAllTabsBtn.style.display = "inline-block";
  managedTabsList.innerHTML = tabs
    .map(
      (tab) =>
        `<div class="activity-item"><span class="name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;color:#e0e0e0">${escapeHtml(tab.title ?? tab.url ?? `Tab #${tab.tabId}`)}</span><span class="time">${tab.label ?? `#${tab.tabId}`}</span></div>`
    )
    .join("");
}

closeAllTabsBtn.addEventListener("click", async () => {
  const response = await send({ type: "closeAllManagedTabs" });
  const count = (response.closed as number) ?? 0;
  if (count > 0) {
    await loadManagedTabs();
  }
});

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

async function init(): Promise<void> {
  await loadToggles();
  await updateStatus();
  await loadRecentActivity();
  await loadManagedTabs();
}

init();

setInterval(updateStatus, 2000);
setInterval(loadRecentActivity, 5000);
setInterval(loadManagedTabs, 5000);
