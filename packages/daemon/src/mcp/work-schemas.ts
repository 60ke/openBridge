import { z } from "zod";

const WorkTargetShape = {
  tabId: z.number().int().nonnegative(),
  conversationUrl: z.string().url(),
  token: z.string().regex(/^[a-f0-9]{32}$/),
  selectors: z.record(z.string()).optional(),
  modePattern: z.string().max(300).optional(),
};
export const WORK_TOOL_SCHEMAS = [
  { name: "chatgpt_work_observe", description: "Observe only the opted-in ChatGPT conversation and anchored reply; unknown is never completed", shape: WorkTargetShape },
  { name: "chatgpt_work_prepare", description: "Prepare local image attachments and text, without sending; requires explicit conversation opt-in", shape: { ...WorkTargetShape, text: z.string().max(100000), paths: z.array(z.string()).max(10).optional() } },
  { name: "chatgpt_work_submit", description: "Send an exactly matching prepared draft once; caller must reconcile uncertain outcomes", shape: { ...WorkTargetShape, text: z.string().max(100000), attachmentCount: z.number().int().nonnegative() } },
  { name: "chatgpt_work_capture", description: "Capture the current anchored result image for visual review, NOT as original output", shape: { ...WorkTargetShape, artifactKey: z.string() } },
  { name: "browser_download_begin", description: "Idempotent opt-in download of an anchored original artifact; persists intent before action", shape: { ...WorkTargetShape, operationId: z.string(), artifactKey: z.string() } },
  { name: "browser_download_status", description: "Recover the tracked download and report Chrome completion/ambiguity", shape: { ...WorkTargetShape, operationId: z.string() } },
];
