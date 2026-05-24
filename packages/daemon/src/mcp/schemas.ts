import { z } from "zod";

export const ListTabsShape = {};

export const NewTabShape = { url: z.string().url().optional() };

export const SelectTabShape = { tabId: z.number() };

export const NavigateShape = { url: z.string().url() };

export const SnapshotShape = {};

export const ClickShape = { selector: z.string().optional(), ref: z.string().optional() };

export const FillShape = { selector: z.string(), value: z.string() };

export const TypeShape = { text: z.string() };

export const SendKeysShape = { keys: z.string() };

export const ScreenshotShape = {};

export const EvaluateShape = { expression: z.string() };

export interface ToolSchemaEntry {
  name: string;
  description: string;
  shape: Record<string, z.ZodTypeAny>;
}

export const TOOL_SCHEMAS: ToolSchemaEntry[] = [
  { name: "browser_list_tabs", description: "List all open browser tabs", shape: ListTabsShape },
  { name: "browser_new_tab", description: "Open a new browser tab and attach OpenBridge to it", shape: NewTabShape },
  { name: "browser_select_tab", description: "Switch to a specific browser tab by ID", shape: SelectTabShape },
  { name: "browser_navigate", description: "Navigate the current tab to a URL", shape: NavigateShape },
  { name: "browser_snapshot", description: "Capture an accessibility snapshot of the current page", shape: SnapshotShape },
  { name: "browser_click", description: "Click an element on the page by CSS selector or snapshot ref", shape: ClickShape },
  { name: "browser_fill", description: "Fill a form field with a value", shape: FillShape },
  { name: "browser_type", description: "Type text into the currently focused element", shape: TypeShape },
  { name: "browser_send_keys", description: "Send keyboard shortcuts or special keys", shape: SendKeysShape },
  { name: "browser_screenshot", description: "Take a screenshot of the current page", shape: ScreenshotShape },
  { name: "browser_evaluate", description: "Evaluate a JavaScript expression in the page context", shape: EvaluateShape },
];
