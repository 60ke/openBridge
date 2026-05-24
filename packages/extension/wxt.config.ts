import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "OpenBridge",
    description: "Browser automation bridge for AI agents",
    version: "0.1.0",
    permissions: ["tabs", "activeTab", "debugger", "storage", "alarms", "scripting"],
    host_permissions: ["<all_urls>"],
  },
});
