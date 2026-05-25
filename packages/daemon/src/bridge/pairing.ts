import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ErrorCode } from "@openbridge-org/shared";

interface PairingData {
  secret: string;
  extensionTokens: string[];
}

export class PairingManager {
  private dataDir: string;
  private pairingFilePath: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? path.join(process.cwd(), ".openbridge-data");
    this.pairingFilePath = path.join(this.dataDir, "pairing.json");
  }

  loadPairing(): PairingData | null {
    try {
      const raw = fs.readFileSync(this.pairingFilePath, "utf-8");
      return JSON.parse(raw) as PairingData;
    } catch {
      return null;
    }
  }

  savePairing(data: PairingData): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const tmpPath = this.pairingFilePath + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmpPath, this.pairingFilePath);
  }

  generateSecret(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  initiatePairing(): string {
    const existing = this.loadPairing();
    const secret = this.generateSecret();
    this.savePairing({
      secret,
      extensionTokens: existing?.extensionTokens ?? [],
    });
    return secret;
  }

  validateToken(token: string): boolean {
    const data = this.loadPairing();
    if (!data) return false;
    return data.extensionTokens.includes(token);
  }

  confirmPairing(secret: string, token: string): boolean {
    const data = this.loadPairing();
    if (!data || data.secret !== secret) return false;
    if (!data.extensionTokens.includes(token)) {
      data.extensionTokens.push(token);
    }
    this.savePairing(data);
    return true;
  }

  resetPairing(): void {
    try {
      fs.unlinkSync(this.pairingFilePath);
    } catch {}
  }

  isPaired(): boolean {
    const data = this.loadPairing();
    return !!data && data.extensionTokens.length > 0;
  }
}
