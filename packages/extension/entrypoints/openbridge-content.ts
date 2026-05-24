import { CursorOverlay } from "../src/content/cursor-overlay";
import { ElementHighlighter } from "../src/content/element-highlighter";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",

  main() {
    const cursorOverlay = new CursorOverlay();
    const elementHighlighter = new ElementHighlighter();

    chrome.runtime.onMessage.addListener(
      (message: Record<string, unknown>, _sender: ChromeMessageSender, sendResponse: (response?: Record<string, unknown>) => void) => {
        const msg = message as { type: string; x?: number; y?: number; selector?: string; ref?: string };

        switch (msg.type) {
          case "showCursor": {
            if (msg.x != null && msg.y != null) {
              cursorOverlay.show(msg.x, msg.y);
            }
            sendResponse({ success: true });
            break;
          }
          case "clickCursor": {
            if (msg.x != null && msg.y != null) {
              cursorOverlay.click(msg.x, msg.y);
            }
            sendResponse({ success: true });
            break;
          }
          case "hideCursor": {
            cursorOverlay.hide();
            sendResponse({ success: true });
            break;
          }
          case "highlightElement": {
            if (msg.selector) {
              elementHighlighter.highlight(msg.selector);
            } else if (msg.ref) {
              elementHighlighter.highlightRef(msg.ref);
            }
            sendResponse({ success: true });
            break;
          }
          case "clearHighlights": {
            elementHighlighter.clear();
            sendResponse({ success: true });
            break;
          }
          default:
            sendResponse({ error: "Unknown message type" });
        }

        return false;
      }
    );

    window.addEventListener("unload", () => {
      cursorOverlay.destroy();
      elementHighlighter.destroy();
    });
  },
});
