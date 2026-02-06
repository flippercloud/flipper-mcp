#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "flipper-cloud",
  version: "0.1.0",
});

const FLIPPER_TOKEN = process.env.FLIPPER_CLOUD_TOKEN;
const FLIPPER_URL =
  process.env.FLIPPER_CLOUD_URL || "https://www.flippercloud.io/adapter";

interface FlipperError {
  code: number | string;
  message: string;
  more_info?: string;
}

interface FlipperGate {
  key: string;
  name: string;
  value: unknown;
}

interface FlipperFeature {
  key: string;
  state: string;
  gates: FlipperGate[];
}

interface FeaturesResponse {
  features: FlipperFeature[];
}

interface AuditActor {
  id: string;
  type: string;
}

interface AuditTarget {
  id: string;
  key: string;
  type: string;
}

interface Audit {
  id: string;
  action: string;
  target: AuditTarget;
  actor: AuditActor;
  value: string | null;
  created_at: string;
}

interface AuditsResponse {
  audits: Audit[];
  pagination: {
    page: number;
    per: number;
    previous: number | null;
    next: number | null;
  };
  limits: {
    limited: boolean;
    retention_days?: number;
    max_events?: number;
  };
}

interface TelemetryTimeSeries {
  timestamp: string;
  total: number;
  enabled: number;
  disabled: number;
}

interface TelemetryFeature {
  key: string;
  summary: {
    total: number;
    enabled: number;
    disabled: number;
    enabled_rate: number;
  };
  time_series: TelemetryTimeSeries[];
}

interface TelemetrySummaryResponse {
  days: number;
  resolution: string;
  features: TelemetryFeature[];
}

async function flipperRequest<T>(
  path: string,
  method = "GET",
  body?: unknown
): Promise<{ data?: T; error?: string; status: number }> {
  if (!FLIPPER_TOKEN) {
    return {
      error:
        "FLIPPER_CLOUD_TOKEN environment variable is not set. Get your token from flippercloud.io/settings/tokens",
      status: 401,
    };
  }

  try {
    const res = await fetch(`${FLIPPER_URL}${path}`, {
      method,
      headers: {
        "Flipper-Cloud-Token": FLIPPER_TOKEN,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    // Handle specific error cases
    if (res.status === 403) {
      return {
        error:
          "Token is read-only. Use a read-write token to make changes. You can create one at flippercloud.io/settings/tokens",
        status: 403,
      };
    }

    if (res.status === 402) {
      const errorData = (await res.json()) as FlipperError;
      return {
        error:
          errorData.message ||
          "This feature is not available on your current plan. Upgrade at flippercloud.io",
        status: 402,
      };
    }

    if (res.status === 404) {
      const errorData = (await res.json()) as FlipperError;
      return {
        error: errorData.message || "Resource not found",
        status: 404,
      };
    }

    if (res.status === 422) {
      const errorData = (await res.json()) as FlipperError;
      return {
        error: errorData.message || "Invalid request",
        status: 422,
      };
    }

    if (res.status === 204) {
      return { status: 204 };
    }

    if (!res.ok) {
      return {
        error: `Request failed with status ${res.status}`,
        status: res.status,
      };
    }

    const data = (await res.json()) as T;
    return { data, status: res.status };
  } catch (err) {
    return {
      error: `Network error: ${err instanceof Error ? err.message : "Unknown error"}`,
      status: 0,
    };
  }
}

function formatFeature(feature: FlipperFeature): string {
  const lines = [`Feature: ${feature.key}`, `State: ${feature.state}`, "Gates:"];

  for (const gate of feature.gates) {
    if (gate.value === null || gate.value === false || gate.value === "false") {
      continue; // Skip disabled gates
    }

    switch (gate.key) {
      case "boolean":
        lines.push(`  - Boolean: ${gate.value}`);
        break;
      case "actors":
        if (Array.isArray(gate.value) && gate.value.length > 0) {
          lines.push(`  - Actors: ${(gate.value as string[]).join(", ")}`);
        }
        break;
      case "groups":
        if (Array.isArray(gate.value) && gate.value.length > 0) {
          lines.push(`  - Groups: ${(gate.value as string[]).join(", ")}`);
        }
        break;
      case "percentage_of_actors":
        lines.push(`  - Percentage of Actors: ${gate.value}%`);
        break;
      case "percentage_of_time":
        lines.push(`  - Percentage of Time: ${gate.value}%`);
        break;
      case "expression":
        lines.push(`  - Expression: ${JSON.stringify(gate.value)}`);
        break;
    }
  }

  if (lines.length === 3) {
    lines.push("  (no active gates)");
  }

  return lines.join("\n");
}

function formatFeaturesList(features: FlipperFeature[]): string {
  if (features.length === 0) {
    return "No features found.";
  }

  return features.map(formatFeature).join("\n\n---\n\n");
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function formatAudit(audit: Audit): string {
  const time = new Date(audit.created_at).toLocaleString();
  const actorInfo = `${audit.actor.type}:${audit.actor.id}`;
  const value = audit.value ? ` (${audit.value})` : "";
  return `[${time}] ${audit.action} on ${audit.target.key}${value} by ${actorInfo}`;
}

function formatAuditsList(
  audits: Audit[],
  pagination: AuditsResponse["pagination"],
  limits: AuditsResponse["limits"]
): string {
  if (audits.length === 0) {
    return "No audits found.";
  }

  const lines = audits.map(formatAudit);

  const pageInfo = [`Page ${pagination.page} (${pagination.per} per page)`];
  if (pagination.previous) pageInfo.push(`previous: ${pagination.previous}`);
  if (pagination.next) pageInfo.push(`next: ${pagination.next}`);

  let result = lines.join("\n") + "\n\n" + pageInfo.join(", ");

  if (limits.limited) {
    if (limits.retention_days) {
      result += `\n(Audit history limited to ${limits.retention_days} days on your plan)`;
    } else if (limits.max_events) {
      result += `\n(Audit history limited to ${limits.max_events} events on your plan)`;
    }
  }

  return result;
}

function formatTelemetrySummary(data: TelemetrySummaryResponse): string {
  if (data.features.length === 0) {
    return "No telemetry data found.";
  }

  const lines = [
    `Telemetry (last ${data.days} day${data.days === 1 ? "" : "s"}, ${data.resolution} resolution)`,
    "",
  ];

  const sorted = [...data.features].sort(
    (a, b) => b.summary.total - a.summary.total
  );

  for (const feature of sorted) {
    const rate = (feature.summary.enabled_rate * 100).toFixed(1);
    lines.push(
      `${feature.key}: ${feature.summary.total.toLocaleString()} checks (${rate}% enabled)`
    );
  }

  return lines.join("\n");
}

function formatFeatureTelemetry(feature: TelemetryFeature, days: number, resolution: string): string {
  const rate = (feature.summary.enabled_rate * 100).toFixed(1);
  const lines = [
    `Telemetry for ${feature.key} (last ${days} day${days === 1 ? "" : "s"})`,
    "",
    `Total checks: ${feature.summary.total.toLocaleString()}`,
    `Enabled: ${feature.summary.enabled.toLocaleString()} (${rate}%)`,
    `Disabled: ${feature.summary.disabled.toLocaleString()}`,
  ];

  if (feature.time_series.length > 0) {
    lines.push("", "Time series:");
    for (const point of feature.time_series) {
      const ts = resolution === "hour"
        ? new Date(point.timestamp).toLocaleTimeString()
        : new Date(point.timestamp).toLocaleDateString();
      const pointRate = point.total > 0
        ? ((point.enabled / point.total) * 100).toFixed(1)
        : "0.0";
      lines.push(`  ${ts}: ${point.total.toLocaleString()} checks (${pointRate}% enabled)`);
    }
  }

  return lines.join("\n");
}

// ============================================================================
// Tools
// ============================================================================

// List all features
server.tool(
  "list_features",
  "List all feature flags in your Flipper Cloud environment",
  {},
  async () => {
    const { data, error } = await flipperRequest<FeaturesResponse>("/features");
    if (error) return textResult(`Error: ${error}`);
    return textResult(formatFeaturesList(data!.features));
  }
);

// Get a specific feature
server.tool(
  "get_feature",
  "Get details for a specific feature flag including all gates",
  { name: z.string().describe("The feature flag name") },
  async ({ name }) => {
    const { data, error } = await flipperRequest<FlipperFeature>(
      `/features/${encodeURIComponent(name)}`
    );
    if (error) return textResult(`Error: ${error}`);
    return textResult(formatFeature(data!));
  }
);

// Enable a feature globally
server.tool(
  "enable_feature",
  "Enable a feature flag globally (turns it on for everyone)",
  { name: z.string().describe("The feature flag name") },
  async ({ name }) => {
    const { data, error } = await flipperRequest<FlipperFeature>(
      `/features/${encodeURIComponent(name)}/boolean`,
      "POST"
    );
    if (error) return textResult(`Error: ${error}`);
    return textResult(`Enabled "${name}" globally.\n\n${formatFeature(data!)}`);
  }
);

// Disable a feature globally
server.tool(
  "disable_feature",
  "Disable a feature flag globally (turns it off for everyone)",
  { name: z.string().describe("The feature flag name") },
  async ({ name }) => {
    const { data, error } = await flipperRequest<FlipperFeature>(
      `/features/${encodeURIComponent(name)}/boolean`,
      "DELETE"
    );
    if (error) return textResult(`Error: ${error}`);
    return textResult(`Disabled "${name}" globally.\n\n${formatFeature(data!)}`);
  }
);

// Enable for a specific actor
server.tool(
  "enable_actor",
  "Enable a feature flag for a specific actor (user, account, etc.)",
  {
    name: z.string().describe("The feature flag name"),
    actor: z
      .string()
      .describe(
        "The actor's flipper_id (e.g., 'User;123', 'Account;456', or just '123' for simple IDs)"
      ),
  },
  async ({ name, actor }) => {
    const { data, error } = await flipperRequest<FlipperFeature>(
      `/features/${encodeURIComponent(name)}/actors`,
      "POST",
      { flipper_id: actor }
    );
    if (error) return textResult(`Error: ${error}`);
    return textResult(
      `Enabled "${name}" for actor "${actor}".\n\n${formatFeature(data!)}`
    );
  }
);

// Disable for a specific actor
server.tool(
  "disable_actor",
  "Disable a feature flag for a specific actor",
  {
    name: z.string().describe("The feature flag name"),
    actor: z
      .string()
      .describe(
        "The actor's flipper_id (e.g., 'User;123', 'Account;456', or just '123' for simple IDs)"
      ),
  },
  async ({ name, actor }) => {
    const { data, error } = await flipperRequest<FlipperFeature>(
      `/features/${encodeURIComponent(name)}/actors`,
      "DELETE",
      { flipper_id: actor }
    );
    if (error) return textResult(`Error: ${error}`);
    return textResult(
      `Disabled "${name}" for actor "${actor}".\n\n${formatFeature(data!)}`
    );
  }
);

// Enable for a group
server.tool(
  "enable_group",
  "Enable a feature flag for a registered group",
  {
    name: z.string().describe("The feature flag name"),
    group: z
      .string()
      .describe("The group name (must be registered in your Flipper setup)"),
  },
  async ({ name, group }) => {
    const { data, error } = await flipperRequest<FlipperFeature>(
      `/features/${encodeURIComponent(name)}/groups`,
      "POST",
      { name: group }
    );
    if (error) return textResult(`Error: ${error}`);
    return textResult(
      `Enabled "${name}" for group "${group}".\n\n${formatFeature(data!)}`
    );
  }
);

// Disable for a group
server.tool(
  "disable_group",
  "Disable a feature flag for a group",
  {
    name: z.string().describe("The feature flag name"),
    group: z.string().describe("The group name"),
  },
  async ({ name, group }) => {
    const { data, error } = await flipperRequest<FlipperFeature>(
      `/features/${encodeURIComponent(name)}/groups`,
      "DELETE",
      { name: group }
    );
    if (error) return textResult(`Error: ${error}`);
    return textResult(
      `Disabled "${name}" for group "${group}".\n\n${formatFeature(data!)}`
    );
  }
);

// Enable percentage of actors
server.tool(
  "enable_percentage_of_actors",
  "Enable a feature flag for a percentage of actors (consistent per-actor rollout)",
  {
    name: z.string().describe("The feature flag name"),
    percentage: z
      .number()
      .min(0)
      .max(100)
      .describe("Percentage of actors (0-100)"),
  },
  async ({ name, percentage }) => {
    const { data, error } = await flipperRequest<FlipperFeature>(
      `/features/${encodeURIComponent(name)}/percentage_of_actors`,
      "POST",
      { percentage }
    );
    if (error) return textResult(`Error: ${error}`);
    return textResult(
      `Enabled "${name}" for ${percentage}% of actors.\n\n${formatFeature(data!)}`
    );
  }
);

// Disable percentage of actors
server.tool(
  "disable_percentage_of_actors",
  "Disable percentage-based rollout for a feature flag",
  { name: z.string().describe("The feature flag name") },
  async ({ name }) => {
    const { data, error } = await flipperRequest<FlipperFeature>(
      `/features/${encodeURIComponent(name)}/percentage_of_actors`,
      "DELETE"
    );
    if (error) return textResult(`Error: ${error}`);
    return textResult(
      `Disabled percentage rollout for "${name}".\n\n${formatFeature(data!)}`
    );
  }
);

// Expression gate with friendly interface
const conditionSchema = z.object({
  property: z.string().describe("The property name to check (e.g., 'plan', 'country', 'age')"),
  operator: z
    .enum([
      "eq",
      "neq",
      "gt",
      "gte",
      "lt",
      "lte",
      "in",
      "nin",
      "contains",
      "not_contains",
    ])
    .describe(
      "Comparison operator: eq (equals), neq (not equals), gt (greater than), gte (greater or equal), lt (less than), lte (less or equal), in (value in list), nin (value not in list), contains (string contains), not_contains (string does not contain)"
    ),
  value: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))])
    .describe("The value to compare against. Use an array for 'in' and 'nin' operators."),
});

server.tool(
  "enable_expression",
  "Enable a feature flag based on actor properties using conditions. This allows targeting based on properties like plan type, country, user attributes, etc.",
  {
    name: z.string().describe("The feature flag name"),
    conditions: z
      .array(conditionSchema)
      .describe("Array of conditions to match"),
    logic: z
      .enum(["and", "or"])
      .default("and")
      .describe("How to combine conditions: 'and' (all must match) or 'or' (any can match)"),
  },
  async ({ name, conditions, logic }) => {
    // Build the expression object
    const expression = {
      type: logic,
      operands: conditions.map((c) => ({
        type: "match",
        operator: c.operator,
        property: c.property,
        value: c.value,
      })),
    };

    const { data, error } = await flipperRequest<FlipperFeature>(
      `/features/${encodeURIComponent(name)}/expression`,
      "POST",
      expression
    );
    if (error) return textResult(`Error: ${error}`);

    const conditionStr = conditions
      .map((c) => `${c.property} ${c.operator} ${JSON.stringify(c.value)}`)
      .join(` ${logic.toUpperCase()} `);
    return textResult(
      `Enabled "${name}" with expression: ${conditionStr}\n\n${formatFeature(data!)}`
    );
  }
);

// Disable expression gate
server.tool(
  "disable_expression",
  "Disable the expression gate for a feature flag",
  { name: z.string().describe("The feature flag name") },
  async ({ name }) => {
    const { data, error } = await flipperRequest<FlipperFeature>(
      `/features/${encodeURIComponent(name)}/expression`,
      "DELETE"
    );
    if (error) return textResult(`Error: ${error}`);
    return textResult(
      `Disabled expression gate for "${name}".\n\n${formatFeature(data!)}`
    );
  }
);

// Create a new feature
server.tool(
  "create_feature",
  "Create a new feature flag",
  { name: z.string().describe("The name for the new feature flag") },
  async ({ name }) => {
    const { data, error } = await flipperRequest<FlipperFeature>(
      "/features",
      "POST",
      { name }
    );
    if (error) return textResult(`Error: ${error}`);
    return textResult(`Created feature "${name}".\n\n${formatFeature(data!)}`);
  }
);

// Delete a feature
server.tool(
  "delete_feature",
  "Permanently delete a feature flag (cannot be undone)",
  { name: z.string().describe("The feature flag name to delete") },
  async ({ name }) => {
    const { error, status } = await flipperRequest(
      `/features/${encodeURIComponent(name)}`,
      "DELETE"
    );
    if (error) return textResult(`Error: ${error}`);
    if (status === 204) {
      return textResult(`Deleted feature "${name}".`);
    }
    return textResult(`Deleted feature "${name}".`);
  }
);

// Get audit log
server.tool(
  "get_audits",
  "Get the audit log showing recent changes to feature flags. Requires a paid plan.",
  {
    page: z.number().min(1).default(1).describe("Page number (default: 1)"),
    per_page: z
      .number()
      .min(1)
      .max(250)
      .default(100)
      .describe("Results per page (default: 100, max: 250)"),
    features: z
      .string()
      .optional()
      .describe("Comma-separated feature names to filter audits (optional, e.g. 'search,dark_mode')"),
  },
  async ({ page, per_page, features }) => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("per_page", String(per_page));
    if (features) {
      params.set("features", features);
    }

    const { data, error } = await flipperRequest<AuditsResponse>(
      `/audits?${params.toString()}`
    );
    if (error) return textResult(`Error: ${error}`);

    return textResult(formatAuditsList(data!.audits, data!.pagination, data!.limits));
  }
);

// Get telemetry summary for all features
server.tool(
  "get_telemetry_summary",
  "Get telemetry summary showing check counts and enable rates for all features. Uses daily aggregates.",
  {
    days: z
      .number()
      .min(1)
      .max(30)
      .default(7)
      .describe("Number of days to include (default: 7, max: 30)"),
    features: z
      .string()
      .optional()
      .describe("Comma-separated feature names to filter (optional, e.g. 'search,dark_mode')"),
  },
  async ({ days, features }) => {
    const params = new URLSearchParams();
    params.set("days", String(days));
    if (features) {
      params.set("keys", features);
    }

    const { data, error } = await flipperRequest<TelemetrySummaryResponse>(
      `/telemetry/summary?${params.toString()}`
    );
    if (error) return textResult(`Error: ${error}`);
    return textResult(formatTelemetrySummary(data!));
  }
);

// Get detailed telemetry for a specific feature
server.tool(
  "get_feature_telemetry",
  "Get detailed telemetry for a specific feature including time series data",
  {
    name: z.string().describe("The feature flag name"),
    days: z
      .number()
      .min(1)
      .max(30)
      .default(7)
      .describe("Number of days (default: 7). Use 1 for hourly resolution, >1 for daily."),
  },
  async ({ name, days }) => {
    const params = new URLSearchParams();
    params.set("days", String(days));
    params.set("keys", name);

    const { data, error } = await flipperRequest<TelemetrySummaryResponse>(
      `/telemetry/summary?${params.toString()}`
    );
    if (error) return textResult(`Error: ${error}`);

    const feature = data!.features.find((f) => f.key === name);
    if (!feature) {
      return textResult(`No telemetry data found for "${name}".`);
    }

    return textResult(formatFeatureTelemetry(feature, data!.days, data!.resolution));
  }
);

// ============================================================================
// Start Server
// ============================================================================

const transport = new StdioServerTransport();
await server.connect(transport);
