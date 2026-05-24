export interface HelloPayload {
  version: string;
  sessionId: string;
}

export interface HelloAckPayload {
  version: string;
  sessionId: string;
}

export interface PairRequestPayload {
  sessionId: string;
  clientName: string;
}

export interface PairChallengePayload {
  challenge: string;
}

export interface PairConfirmedPayload {
  secret: string;
  token: string;
}

export interface HeartbeatPayload {
  timestamp: number;
}

export interface ConfigChangedPayload {
  key: "paused" | "evaluate_enabled";
  value: boolean;
}

export interface CommandPayload {
  name: string;
  args: Record<string, unknown>;
}

export interface CommandResultPayload {
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

export interface EventPayload {
  eventType: string;
  details: Record<string, unknown>;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export type BridgeMessageType =
  | "hello"
  | "hello_ack"
  | "pair_request"
  | "pair_challenge"
  | "pair_confirmed"
  | "heartbeat"
  | "command"
  | "command_result"
  | "event"
  | "error";

export interface BridgeMessageBase<T extends BridgeMessageType, P> {
  type: T;
  payload: P;
  timestamp: number;
}

export type BridgeMessage =
  | BridgeMessageBase<"hello", HelloPayload>
  | BridgeMessageBase<"hello_ack", HelloAckPayload>
  | BridgeMessageBase<"pair_request", PairRequestPayload>
  | BridgeMessageBase<"pair_challenge", PairChallengePayload>
  | BridgeMessageBase<"pair_confirmed", PairConfirmedPayload>
  | BridgeMessageBase<"heartbeat", HeartbeatPayload>
  | BridgeMessageBase<"command", CommandPayload>
  | BridgeMessageBase<"command_result", CommandResultPayload>
  | BridgeMessageBase<"event", EventPayload>
  | BridgeMessageBase<"error", ErrorPayload>;
