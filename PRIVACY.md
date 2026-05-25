# OpenBridge Privacy Policy

*Last updated: 2026-05-25*

OpenBridge is an open-source browser bridge that connects AI agents to your local Chrome browser. This privacy policy explains how the OpenBridge Chrome extension handles data.

## Data Collection

**OpenBridge does not collect, transmit, or store any personal data on remote servers.**

The extension operates entirely on your local machine:

- **No analytics or telemetry**: OpenBridge contains no analytics SDKs, tracking code, or telemetry systems. No usage data is sent to any remote server.
- **No third-party services**: The extension does not integrate with any external analytics, crash reporting, or data collection services.
- **No user profiling**: No user behavior is tracked, profiled, or monetized.

## Data Storage

All data is stored locally on your machine using Chrome's `storage.local` API:

| Data | Purpose | Location |
|---|---|---|
| Pairing token | Authenticates the extension with the local daemon | `chrome.storage.local` |
| User preferences (pause, evaluate, cursor toggles) | Remembers your settings across sessions | `chrome.storage.local` |
| Recent operation history (last 20 operations) | Displays recent activity in the popup UI | `chrome.storage.local` |
| Session tab group state | Persists tab group assignments across service worker restarts | `chrome.storage.session` |

This data never leaves your machine.

## Data Transmission

The extension communicates **only** with the local OpenBridge daemon running on your machine:

- **WebSocket connection**: `ws://127.0.0.1:10087/bridge` (loopback only)
- **No external network requests**: The extension does not make HTTP requests to any remote servers
- **Commands and events**: Tool commands (tab navigation, clicks, etc.) and browser events are sent exclusively to the local daemon

## Permissions

The extension requires the following Chrome permissions, each for a specific technical purpose:

| Permission | Reason |
|---|---|
| `tabs` | List, create, select, and close browser tabs |
| `activeTab` | Interact with the currently active tab |
| `debugger` | Use Chrome DevTools Protocol (CDP) to control browser tabs |
| `storage` | Store pairing tokens and user preferences locally |
| `alarms` | Maintain WebSocket connection health checks |
| `scripting` | Inject cursor overlay and element highlighting into pages |
| `tabGroups` | Organize AI-controlled tabs into labeled groups |
| `windows` | Create tab groups in the current browser window |
| `downloads` | Support PDF export and file operations |
| `<all_urls>` host permission | Inject cursor overlay content script into any page the user visits |

## Third-Party Access

OpenBridge does not share any data with third parties. The local daemon's HTTP API (`127.0.0.1:10088`) and WebSocket server (`127.0.0.1:10087`) are bound to loopback only and are not accessible from other machines on your network.

## Open Source

OpenBridge is fully open source. The complete source code is available at:

[https://github.com/60ke/openBridge](https://github.com/60ke/openBridge)

You are encouraged to review the code to verify this privacy policy.

## Changes to This Policy

If this policy is updated, the "Last updated" date at the top of this document will reflect the change. For significant changes, a notice will be added to the extension's release notes.

## Contact

For questions about this privacy policy, please open an issue on the GitHub repository:

[https://github.com/60ke/openBridge/issues](https://github.com/60ke/openBridge/issues)