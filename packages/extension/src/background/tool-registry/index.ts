import type { ToolHandler } from "../command-router";
import { ListTabsHandler } from "./list-tabs";
import { NewTabHandler } from "./new-tab";
import { SelectTabHandler } from "./select-tab";
import { NavigateHandler } from "./navigate";
import { SnapshotHandler } from "./snapshot";
import { ClickHandler } from "./click";
import { FillHandler } from "./fill";
import { TypeHandler } from "./type";
import { SendKeysHandler } from "./send-keys";
import { ScreenshotHandler } from "./screenshot";
import { EvaluateHandler } from "./evaluate";

export const toolHandlers: ToolHandler[] = [
  new ListTabsHandler(),
  new NewTabHandler(),
  new SelectTabHandler(),
  new NavigateHandler(),
  new SnapshotHandler(),
  new ClickHandler(),
  new FillHandler(),
  new TypeHandler(),
  new SendKeysHandler(),
  new ScreenshotHandler(),
  new EvaluateHandler(),
];
