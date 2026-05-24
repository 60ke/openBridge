import { TOOL_SCHEMAS, type ToolSchemaEntry } from "./schemas.js";

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  shape: Record<string, import("zod").ZodTypeAny>;
}

function zodShapeToJsonSchema(shape: Record<string, import("zod").ZodTypeAny>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, schema] of Object.entries(shape)) {
    properties[key] = zodTypeToJsonSchema(schema);
    if (!isOptional(schema)) {
      required.push(key);
    }
  }

  const jsonSchema: Record<string, unknown> = {
    type: "object",
    properties,
  };

  if (required.length > 0) {
    jsonSchema.required = required;
  }

  return jsonSchema;
}

function zodTypeToJsonSchema(schema: import("zod").ZodTypeAny): Record<string, unknown> {
  const def = (schema as unknown as { _def: { typeName: string; innerType?: import("zod").ZodTypeAny } })._def;

  switch (def.typeName) {
    case "ZodString":
      return { type: "string" };
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodArray":
      return { type: "array", items: {} };
    case "ZodOptional":
      return zodTypeToJsonSchema(def.innerType!);
    case "ZodDefault":
      return zodTypeToJsonSchema(def.innerType!);
    default:
      return {};
  }
}

function isOptional(schema: import("zod").ZodTypeAny): boolean {
  const def = (schema as unknown as { _def: { typeName: string } })._def;
  return def.typeName === "ZodOptional" || def.typeName === "ZodDefault";
}

export function getToolDefinitions(): McpToolDefinition[] {
  return TOOL_SCHEMAS.map((entry: ToolSchemaEntry) => ({
    name: entry.name,
    description: entry.description,
    inputSchema: zodShapeToJsonSchema(entry.shape),
    shape: entry.shape,
  }));
}
