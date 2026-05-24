export class CursorOverlay {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private cursor: HTMLDivElement;

  constructor() {
    this.host = document.createElement("div");
    this.host.id = "openbridge-cursor";
    this.shadow = this.host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = `
      .cursor {
        position: fixed;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 2px solid rgba(59, 130, 246, 0.9);
        background: rgba(59, 130, 246, 0.3);
        pointer-events: none;
        z-index: 2147483647;
        transform: translate(-50%, -50%);
        transition: transform 0.15s ease-out, background 0.15s ease-out, border-color 0.15s ease-out;
        top: 0;
        left: 0;
        display: none;
      }
      .cursor.clicking {
        transform: translate(-50%, -50%) scale(1.6);
        background: rgba(34, 197, 94, 0.4);
        border-color: rgba(34, 197, 94, 0.9);
      }
    `;

    this.cursor = document.createElement("div");
    this.cursor.className = "cursor";

    this.shadow.appendChild(style);
    this.shadow.appendChild(this.cursor);
    document.body.appendChild(this.host);
  }

  show(x: number, y: number): void {
    this.cursor.style.left = `${x}px`;
    this.cursor.style.top = `${y}px`;
    this.cursor.style.display = "block";
  }

  click(x: number, y: number): void {
    this.show(x, y);
    this.cursor.classList.add("clicking");
    setTimeout(() => {
      this.cursor.classList.remove("clicking");
    }, 300);
  }

  hide(): void {
    this.cursor.style.display = "none";
  }

  destroy(): void {
    this.host.remove();
  }
}
