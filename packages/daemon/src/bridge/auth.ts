import { ErrorCode } from "@openbridge/shared";
import type { PairingManager } from "./pairing.js";

export class AuthManager {
  private pairingManager: PairingManager;

  constructor(pairingManager: PairingManager) {
    this.pairingManager = pairingManager;
  }

  validateOrigin(origin: string | undefined): boolean {
    if (!origin) return true;
    if (origin.startsWith("chrome-extension://")) return true;
    return false;
  }

  authenticate(token: string): boolean {
    return this.pairingManager.validateToken(token);
  }

  isAuthorized(token: string | undefined): { authorized: boolean; error?: ErrorCode } {
    if (!token) {
      return { authorized: false, error: ErrorCode.NOT_PAIRED };
    }
    if (!this.authenticate(token)) {
      return { authorized: false, error: ErrorCode.AUTH_FAILED };
    }
    return { authorized: true };
  }
}
