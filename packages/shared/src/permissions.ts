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
  { toolName: "browser_close_tab", riskLevel: RiskLevel.MEDIUM, defaultEnabled: true },
  { toolName: "browser_close_session", riskLevel: RiskLevel.MEDIUM, defaultEnabled: true },
  { toolName: "browser_find_tab", riskLevel: RiskLevel.LOW, defaultEnabled: true },
  { toolName: "browser_mouse_click", riskLevel: RiskLevel.MEDIUM, defaultEnabled: true },
  { toolName: "browser_key_type", riskLevel: RiskLevel.MEDIUM, defaultEnabled: true },
  { toolName: "browser_upload", riskLevel: RiskLevel.MEDIUM, defaultEnabled: true },
  { toolName: "browser_save_as_pdf", riskLevel: RiskLevel.LOW, defaultEnabled: true },
  { toolName: "browser_network", riskLevel: RiskLevel.MEDIUM, defaultEnabled: true },
  { toolName: "browser_close_all_managed_tabs", riskLevel: RiskLevel.MEDIUM, defaultEnabled: true },
];
