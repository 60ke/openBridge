import type { ToolHandler } from "../command-router";
import { cdpExecutor } from "../cdp-executor";

const KEY_MAP: Record<string, string> = {
  Enter: "Enter",
  Tab: "Tab",
  Escape: "Escape",
  Backspace: "Backspace",
  Delete: "Delete",
  ArrowUp: "ArrowUp",
  ArrowDown: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Space: " ",
  Control: "Control",
  Alt: "Alt",
  Shift: "Shift",
  Meta: "Meta",
};

const MODIFIER_MAP: Record<string, number> = {
  Control: 2,
  Alt: 1,
  Shift: 8,
  Meta: 4,
};

function parseKeyCombo(combo: string): { key: string; modifiers: number }[] {
  return combo.split(",").map((part) => {
    const keys = part.trim().split("+");
    let modifiers = 0;
    let mainKey = "";
    for (const k of keys) {
      const trimmed = k.trim();
      if (MODIFIER_MAP[trimmed] != null) {
        modifiers |= MODIFIER_MAP[trimmed];
      } else {
        mainKey = KEY_MAP[trimmed] ?? trimmed;
      }
    }
    return { key: mainKey, modifiers };
  });
}

export class SendKeysHandler implements ToolHandler {
  name = "browser_send_keys";

  async execute(
    args: Record<string, any>
  ): Promise<{ data?: any; error?: { code: string; message: string } }> {
    const keys = args.keys as string;
    const combos = parseKeyCombo(keys);

    for (const { key, modifiers } of combos) {
      await cdpExecutor.sendCommand("Input.dispatchKeyEvent", {
        type: "keyDown",
        key,
        code: `Key${key.length === 1 ? key.toUpperCase() : key}`,
        modifiers,
      });
      await cdpExecutor.sendCommand("Input.dispatchKeyEvent", {
        type: "keyUp",
        key,
        code: `Key${key.length === 1 ? key.toUpperCase() : key}`,
        modifiers,
      });
    }

    return {
      data: {
        success: true,
      },
    };
  }
}
