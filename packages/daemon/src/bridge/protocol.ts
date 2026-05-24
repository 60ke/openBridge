import {
  type BridgeMessage,
  type BridgeMessageBase,
  type HelloAckPayload,
  type HeartbeatPayload,
  type CommandPayload,
  type ErrorPayload,
  type ErrorCode,
} from "@openbridge/shared";

export function encodeMessage(msg: BridgeMessage, extra?: Record<string, unknown>): string {
  return JSON.stringify({ version: 1, ...(msg as unknown as Record<string, unknown>), ...extra });
}

export function decodeMessage(raw: string): BridgeMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Message must be an object");
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.type !== "string") {
    throw new Error("Message must have a type field");
  }

  if (obj.payload === undefined) {
    throw new Error("Message must have a payload field");
  }

  if (typeof obj.timestamp !== "number") {
    throw new Error("Message must have a timestamp field");
  }

  const { version, requestId, sessionId, ...message } = obj;
  return message as unknown as BridgeMessage;
}

export function createHelloAck(): BridgeMessageBase<"hello_ack", HelloAckPayload> {
  return {
    type: "hello_ack",
    payload: { version: "0.1.0", sessionId: "" },
    timestamp: Date.now(),
  };
}

export function createHeartbeat(): BridgeMessageBase<"heartbeat", HeartbeatPayload> {
  return {
    type: "heartbeat",
    payload: { timestamp: Date.now() },
    timestamp: Date.now(),
  };
}

export function createCommand(
  requestId: string,
  sessionId: string,
  payload: CommandPayload,
): BridgeMessageBase<"command", CommandPayload> & { requestId: string; sessionId: string } {
  return {
    type: "command",
    payload,
    requestId,
    sessionId,
    timestamp: Date.now(),
  };
}

export function createError(
  requestId: string,
  code: ErrorCode,
  message: string,
): BridgeMessageBase<"error", ErrorPayload> & { requestId: string } {
  return {
    type: "error",
    payload: { code: code as string, message },
    requestId,
    timestamp: Date.now(),
  };
}
