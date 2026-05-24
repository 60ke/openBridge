import type { ToolHandler } from "../command-router";
import { cdpExecutor } from "../cdp-executor";

const INTERACTIVE_ROLES = new Set([
  "button", "link", "textbox", "combobox", "checkbox", "radio",
  "slider", "tab", "menuitem", "treeitem", "searchbox", "spinbutton",
]);

const STRUCTURAL_ROLES = new Set([
  "heading", "main", "navigation", "article", "section", "aside",
  "footer", "header", "form", "dialog", "alert", "alertdialog",
  "list", "listitem", "table", "row", "cell", "grid", "tablist",
  "tabpanel", "toolbar", "menu", "menubar", "tree", "treegrid",
]);

export class SnapshotHandler implements ToolHandler {
  name = "browser_snapshot";

  async execute(
    args: Record<string, any>
  ): Promise<{ data?: any; error?: { code: string; message: string } }> {
    if (cdpExecutor.activeTabId == null) {
      return {
        error: {
          code: "TAB_NOT_FOUND",
          message: "No active tab attached to debugger",
        },
      };
    }

    const mode = (args.mode as string) ?? "compact";
    const maxNodes = (args.maxNodes as number) ?? 300;
    const includeHidden = args.includeHidden === true;

    const result = await cdpExecutor.sendCommand("Accessibility.getFullAXTree");
    const rawNodes = result.nodes as Array<Record<string, any>>;

    const tab = await chrome.tabs.get(cdpExecutor.activeTabId);

    if (mode === "full") {
      const nodes = rawNodes.map((node) => ({
        role: node.role?.value,
        name: node.name?.value,
        ref: node.backendDOMNodeId,
      }));
      return {
        data: {
          url: tab.url,
          title: tab.title,
          snapshot: nodes,
        },
      };
    }

    const compactNodes: Array<Record<string, unknown>> = [];
    let refCounter = 0;
    const backendRefMap = new Map<number, string>();

    for (const node of rawNodes) {
      if (compactNodes.length >= maxNodes) break;

      const role = node.role?.value;
      const name = node.name?.value;
      const backendId = node.backendDOMNodeId as number | undefined;

      if (!role) continue;
      if (!includeHidden && node.hidden) continue;

      const isInteractive = INTERACTIVE_ROLES.has(role);
      const isStructural = STRUCTURAL_ROLES.has(role);
      const hasName = !!name;

      if (!isInteractive && !isStructural && !hasName) continue;

      const ref = `ax-${++refCounter}`;
      if (backendId != null) {
        backendRefMap.set(backendId, ref);
      }

      const entry: Record<string, unknown> = {
        ref,
        role,
      };

      if (name) entry.name = name;
      if (node.value?.value) entry.value = node.value.value;
      if (isInteractive) entry.clickable = true;
      if (role === "textbox" || role === "searchbox" || role === "combobox") entry.editable = true;

      const bounds = node.bounds;
      if (bounds && typeof bounds === "object") {
        entry.bounds = {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        };
      }

      compactNodes.push(entry);
    }

    return {
      data: {
        url: tab.url,
        title: tab.title,
        nodes: compactNodes,
        _refMap: Object.fromEntries(backendRefMap),
      },
    };
  }
}
