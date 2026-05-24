export enum RiskLevel {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
}

export interface ToolPermission {
  toolName: string;
  riskLevel: RiskLevel;
  defaultEnabled: boolean;
}

export const MVP_TOOLS: ToolPermission[] = [
  { toolName: "browser_list_tabs", riskLevel: RiskLevel.LOW, defaultEnabled: true },
  { toolName: "browser_new_tab", riskLevel: RiskLevel.MEDIUM, defaultEnabled: true },
  { toolName: "browser_select_tab", riskLevel: RiskLevel.LOW, defaultEnabled: true },
  { toolName: "browser_navigate", riskLevel: RiskLevel.MEDIUM, defaultEnabled: true },
  { toolName: "browser_snapshot", riskLevel: RiskLevel.LOW, defaultEnabled: true },
  { toolName: "browser_click", riskLevel: RiskLevel.MEDIUM, defaultEnabled: true },
  { toolName: "browser_fill", riskLevel: RiskLevel.MEDIUM, defaultEnabled: true },
  { toolName: "browser_type", riskLevel: RiskLevel.MEDIUM, defaultEnabled: true },
  { toolName: "browser_send_keys", riskLevel: RiskLevel.MEDIUM, defaultEnabled: true },
  { toolName: "browser_screenshot", riskLevel: RiskLevel.LOW, defaultEnabled: true },
  { toolName: "browser_evaluate", riskLevel: RiskLevel.HIGH, defaultEnabled: false },
];
