import { RiskLevel, MVP_TOOLS, ErrorCode } from "@openbridge/shared";

export class PermissionManager {
  enabledTools: Set<string>;
  highRiskTools: Set<string>;

  constructor() {
    this.enabledTools = new Set(
      MVP_TOOLS.filter((t) => t.defaultEnabled).map((t) => t.toolName),
    );
    this.highRiskTools = new Set(
      MVP_TOOLS.filter((t) => t.riskLevel === RiskLevel.HIGH).map((t) => t.toolName),
    );
  }

  isToolAllowed(toolName: string): { allowed: boolean; error?: ErrorCode } {
    const known = MVP_TOOLS.some((t) => t.toolName === toolName);
    if (!known) {
      return { allowed: false, error: ErrorCode.INVALID_PARAMS };
    }
    if (this.highRiskTools.has(toolName) && !this.enabledTools.has(toolName)) {
      return { allowed: false, error: ErrorCode.PERMISSION_DENIED };
    }
    return { allowed: true };
  }

  enableTool(toolName: string): void {
    this.enabledTools.add(toolName);
  }

  disableTool(toolName: string): void {
    this.enabledTools.delete(toolName);
  }

  getToolRiskLevel(toolName: string): RiskLevel | undefined {
    return MVP_TOOLS.find((t) => t.toolName === toolName)?.riskLevel;
  }

  getEnabledTools(): string[] {
    return Array.from(this.enabledTools);
  }

  getHighRiskTools(): string[] {
    return Array.from(this.highRiskTools);
  }
}
