import { z } from "zod";

export const ListTabsShape = {};

export const NewTabShape = {
  url: z.string().url().optional(),
  sessionId: z.string().optional(),
  groupTitle: z.string().optional(),
  groupColor: z.string().optional(),
};

export const SelectTabShape = {
  tabId: z.number(),
  sessionId: z.string().optional(),
  groupTitle: z.string().optional(),
  groupColor: z.string().optional(),
};

export const NavigateShape = {
  url: z.string().url(),
  newTab: z.boolean().optional(),
  sessionId: z.string().optional(),
  groupTitle: z.string().optional(),
  groupColor: z.string().optional(),
  waitUntil: z.enum(["none", "domcontentloaded", "load", "networkIdle"]).optional(),
  timeoutMs: z.number().optional(),
};

export const SnapshotShape = {
  mode: z.enum(["full", "compact"]).optional(),
  maxNodes: z.number().optional(),
  includeHidden: z.boolean().optional(),
};

export const ClickShape = { selector: z.string().optional(), ref: z.string().optional() };

export const FillShape = { selector: z.string(), value: z.string() };

export const TypeShape = { text: z.string() };

export const SendKeysShape = { keys: z.string() };

export const ScreenshotShape = {};

export const EvaluateShape = { expression: z.string() };

export const CloseTabShape = { tabId: z.number() };

export const CloseSessionShape = {
  sessionId: z.string(),
  closeTabs: z.boolean().optional(),
};

export const FindTabShape = {
  query: z.string().optional(),
  urlContains: z.string().optional(),
  titleContains: z.string().optional(),
  sessionId: z.string().optional(),
  activate: z.boolean().optional(),
};

export const MouseClickShape = {
  x: z.number(),
  y: z.number(),
  button: z.enum(["left", "right", "middle"]).optional(),
  clickCount: z.number().optional(),
};

export const KeyTypeShape = { text: z.string() };

export const UploadShape = {
  selector: z.string(),
  paths: z.array(z.string()),
};

export const SaveAsPdfShape = {
  printBackground: z.boolean().optional(),
};

export const NetworkShape = {
  action: z.enum(["start", "stop", "get", "clear"]).optional(),
  limit: z.number().optional(),
};

export interface ToolSchemaEntry {
  name: string;
  description: string;
  shape: Record<string, z.ZodTypeAny>;
}

export const TOOL_SCHEMAS: ToolSchemaEntry[] = [
  { name: "browser_list_tabs", description: "List all open browser tabs with group information. Use this to see which tabs belong to which session", shape: ListTabsShape },
  { name: "browser_new_tab", description: "Open a new browser tab. Always provide sessionId and a descriptive groupTitle so the tab is organized under a labeled group that can be bulk-cleaned later. Use close_session to close all tabs for a session when done", shape: NewTabShape },
  { name: "browser_select_tab", description: "Switch to a specific browser tab by ID. If this tab belongs to a new task, pass sessionId and groupTitle to assign it to a session group", shape: SelectTabShape },
  { name: "browser_navigate", description: "Navigate to a URL, optionally in a new tab with page load waiting", shape: NavigateShape },
  { name: "browser_snapshot", description: "Capture an accessibility snapshot of the current page", shape: SnapshotShape },
  { name: "browser_click", description: "Click an element on the page by CSS selector or snapshot ref", shape: ClickShape },
  { name: "browser_fill", description: "Fill a form field with a value", shape: FillShape },
  { name: "browser_type", description: "Type text into the currently focused element", shape: TypeShape },
  { name: "browser_send_keys", description: "Send keyboard shortcuts or special keys", shape: SendKeysShape },
  { name: "browser_screenshot", description: "Take a screenshot of the current page", shape: ScreenshotShape },
  { name: "browser_evaluate", description: "Evaluate a JavaScript expression in the page context", shape: EvaluateShape },
  { name: "browser_close_tab", description: "Close a specific browser tab by ID", shape: CloseTabShape },
  { name: "browser_close_session", description: "Close all tabs managed by a session and clean up the session group. Only tabs belonging to this session are closed — other tabs and the browser window remain open", shape: CloseSessionShape },
  { name: "browser_find_tab", description: "Find browser tabs by URL, title, or session", shape: FindTabShape },
  { name: "browser_mouse_click", description: "Click at viewport coordinates using CDP mouse events", shape: MouseClickShape },
  { name: "browser_key_type", description: "Type text using CDP insertText for more reliable input", shape: KeyTypeShape },
  { name: "browser_upload", description: "Upload files to a file input element", shape: UploadShape },
  { name: "browser_save_as_pdf", description: "Export the current page as PDF", shape: SaveAsPdfShape },
  { name: "browser_network", description: "Observe network requests (start/get/clear)", shape: NetworkShape },
];
