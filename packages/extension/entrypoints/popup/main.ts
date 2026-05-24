const statusDot = document.getElementById("statusDot")!;
const connectionStatus = document.getElementById("connectionStatus")!;
const pairingInfo = document.getElementById("pairingInfo")!;
const evaluateToggle = document.getElementById("evaluateToggle") as HTMLInputElement;
const pauseToggle = document.getElementById("pauseToggle") as HTMLInputElement;
const activityList = document.getElementById("activityList")!;
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
      pairingInfo.innerHTML = `<span class="paired-text">Paired ✓</span><button class="btn btn-danger" id="resetPairBtn">Reset Pairing</button>`;
      document.getElementById("resetPairBtn")!.addEventListener("click", handleResetPairing);
    } else if (transportConnected) {
      pairingInfo.innerHTML = `<span class="not-paired-text">Connected, pairing required</span><button class="btn btn-primary" id="pairBtn">Pair</button>`;
      document.getElementById("pairBtn")!.addEventListener("click", handlePair);
    } else {
      pairingInfo.innerHTML = `<span class="not-paired-text">Pairing Required</span><button class="btn btn-primary" id="pairBtn">Pair</button>`;
      document.getElementById("pairBtn")!.addEventListener("click", handlePair);
    }
  } catch {
    statusDot.classList.remove("connected");
    connectionStatus.innerHTML = `<span class="disconnected-text">Disconnected</span>`;
  }
}

async function handlePair(): Promise<void> {
  const response = await send({ type: "pair" });
  if (response.success !== true && typeof response.error === "string") {
    console.warn(`[OpenBridge] Pair failed: ${response.error}`);
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

async function loadToggles(): Promise<void> {
  const result = await chrome.storage.local.get(["evaluate_enabled", "paused"]);
  evaluateToggle.checked = !!result.evaluate_enabled;
  pauseToggle.checked = !!result.paused;
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
}

init();

setInterval(updateStatus, 2000);
setInterval(loadRecentActivity, 5000);
