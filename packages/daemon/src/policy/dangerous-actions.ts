import { RiskLevel, MVP_TOOLS } from "@openbridge-org/shared";

export const DANGEROUS_ACTIONS: string[] = MVP_TOOLS
  .filter((t) => t.riskLevel === RiskLevel.HIGH)
  .map((t) => t.toolName);

export function isDangerousAction(toolName: string): boolean {
  return DANGEROUS_ACTIONS.includes(toolName);
}
