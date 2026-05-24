import crypto from "node:crypto";

export interface Session {
  id: string;
  createdAt: number;
  lastActivity: number;
  metadata?: Record<string, unknown>;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();

  createSession(metadata?: Record<string, unknown>): Session {
    const id = crypto.randomUUID();
    const session: Session = {
      id,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      metadata,
    };
    this.sessions.set(id, session);
    return session;
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  destroySession(id: string): void {
    this.sessions.delete(id);
  }

  updateActivity(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.lastActivity = Date.now();
    }
  }

  getActiveSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  cleanupStaleSessions(maxAgeMs: number): number {
    const now = Date.now();
    let removed = 0;
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > maxAgeMs) {
        this.sessions.delete(id);
        removed++;
      }
    }
    return removed;
  }
}
