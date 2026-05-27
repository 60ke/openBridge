import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "OpenBridge",
    description: "Browser automation bridge for AI agents",
    version: "0.1.0",
    permissions: ["tabs", "activeTab", "debugger", "storage", "alarms", "tabGroups", "windows"],
    host_permissions: ["<all_urls>"],
    icons: {
      16: "/icons/icon-16.png",
      32: "/icons/icon-32.png",
      48: "/icons/icon-48.png",
      128: "/icons/icon-128.png",
    },
    action: {
      default_icon: {
        16: "/icons/icon-16.png",
        32: "/icons/icon-32.png",
        48: "/icons/icon-48.png",
        128: "/icons/icon-128.png",
      },
    },
  },
});
