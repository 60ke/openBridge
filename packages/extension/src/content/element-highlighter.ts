export class ElementHighlighter {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private highlights: HTMLDivElement[] = [];

  constructor() {
    this.host = document.createElement("div");
    this.host.id = "openbridge-highlighter";
    this.shadow = this.host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = `
      .highlight {
        position: fixed;
        pointer-events: none;
        z-index: 2147483646;
        outline: 2px solid rgba(59, 130, 246, 0.8);
        background: rgba(59, 130, 246, 0.15);
        border-radius: 2px;
      }
    `;

    this.shadow.appendChild(style);
    document.body.appendChild(this.host);
  }

  highlight(selector: string): void {
    const el = document.querySelector(selector);
    if (!el) return;
    this.highlightElement(el as HTMLElement);
  }

  highlightRef(ref: string): void {
    const el = document.querySelector(`[data-openbridge-ref="${ref}"]`);
    if (!el) return;
    this.highlightElement(el as HTMLElement);
  }

  private highlightElement(el: HTMLElement): void {
    const rect = el.getBoundingClientRect();
    const overlay = document.createElement("div");
    overlay.className = "highlight";
    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    this.shadow.appendChild(overlay);
    this.highlights.push(overlay);
  }

  clear(): void {
    for (const h of this.highlights) {
      h.remove();
    }
    this.highlights = [];
  }

  destroy(): void {
    this.clear();
    this.host.remove();
  }
}
