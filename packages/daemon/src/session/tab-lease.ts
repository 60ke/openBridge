import { ErrorCode } from "@openbridge/shared";
import { logger } from "../diagnostics/logger.js";

export interface TabLease {
  tabId: number;
  sessionId: string;
  acquiredAt: number;
  lastRenewedAt: number;
  ttlMs: number;
}

export class TabLeaseManager {
  private leases: Map<number, TabLease> = new Map();
  private readonly DEFAULT_TTL = 10 * 60 * 1000;

  acquire(tabId: number, sessionId: string, ttlMs?: number): { success: boolean; error?: ErrorCode } {
    const existing = this.leases.get(tabId);
    if (existing) {
      if (existing.sessionId === sessionId) {
        this.renew(tabId, sessionId);
        return { success: true };
      }
      return { success: false, error: ErrorCode.TAB_LEASED_BY_OTHER_SESSION };
    }
    const lease: TabLease = {
      tabId,
      sessionId,
      acquiredAt: Date.now(),
      lastRenewedAt: Date.now(),
      ttlMs: ttlMs ?? this.DEFAULT_TTL,
    };
    this.leases.set(tabId, lease);
    return { success: true };
  }

  release(tabId: number, sessionId: string): boolean {
    const lease = this.leases.get(tabId);
    if (lease && lease.sessionId === sessionId) {
      this.leases.delete(tabId);
      return true;
    }
    return false;
  }

  renew(tabId: number, sessionId: string): boolean {
    const lease = this.leases.get(tabId);
    if (lease && lease.sessionId === sessionId) {
      lease.lastRenewedAt = Date.now();
      return true;
    }
    return false;
  }

  isLeased(tabId: number): boolean {
    return this.leases.has(tabId);
  }

  getLease(tabId: number): TabLease | undefined {
    return this.leases.get(tabId);
  }

  getLeasesBySession(sessionId: string): TabLease[] {
    return Array.from(this.leases.values()).filter((l) => l.sessionId === sessionId);
  }

  releaseAllBySession(sessionId: string): number {
    let count = 0;
    for (const [tabId, lease] of this.leases) {
      if (lease.sessionId === sessionId) {
        this.leases.delete(tabId);
        count++;
      }
    }
    return count;
  }

  cleanupExpired(): number {
    const now = Date.now();
    let removed = 0;
    for (const [tabId, lease] of this.leases) {
      if (now - lease.lastRenewedAt > lease.ttlMs) {
        this.leases.delete(tabId);
        logger.info("Tab lease expired for tab", tabId);
        removed++;
      }
    }
    return removed;
  }

  onTabClosed(tabId: number): void {
    if (this.leases.has(tabId)) {
      this.leases.delete(tabId);
      logger.info("Tab lease released for closed tab", tabId);
    }
  }

  startCleanupInterval(intervalMs?: number): ReturnType<typeof setInterval> {
    return setInterval(() => {
      this.cleanupExpired();
    }, intervalMs ?? 60_000);
  }

  stopCleanupInterval(handle: ReturnType<typeof setInterval>): void {
    clearInterval(handle);
  }
}
