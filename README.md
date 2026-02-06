# Flipper Cloud MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server for [Flipper Cloud](https://www.flippercloud.io) feature flags. Lets AI assistants like Claude read and manage your feature flags.

## Setup

### 1. Get your token

Go to your environment in [Flipper Cloud](https://www.flippercloud.io), then **Settings > Credentials** to create a token.

- **Read-only tokens** can list features, view details, and check telemetry
- **Read-write tokens** can also enable/disable features, manage actors, groups, and expressions

### 2. Connect to your AI tool

#### Claude Code

```bash
claude mcp add flipper-cloud -e FLIPPER_CLOUD_TOKEN=<your-token> -- npx -y @flippercloud/mcp
```

## Available Tools

### Read

| Tool | Description |
|------|-------------|
| `list_features` | List all feature flags |
| `get_feature` | Get details for a specific feature |
| `get_audits` | View audit log of recent changes |
| `get_telemetry_summary` | Telemetry overview across features |
| `get_feature_telemetry` | Detailed telemetry for a single feature |

### Write (require read-write token)

| Tool | Description |
|------|-------------|
| `create_feature` | Create a new feature flag |
| `delete_feature` | Permanently delete a feature flag |
| `enable_feature` / `disable_feature` | Toggle a feature globally |
| `enable_actor` / `disable_actor` | Enable/disable for a specific actor |
| `enable_group` / `disable_group` | Enable/disable for a group |
| `enable_percentage_of_actors` / `disable_percentage_of_actors` | Percentage rollouts |
| `enable_expression` / `disable_expression` | Expression-based targeting |

## Examples

Ask Claude things like:

- "List all my feature flags"
- "Enable the new_checkout feature for user 123"
- "Roll out dark_mode to 25% of users"
- "Enable premium_features for users where plan equals 'pro'"
- "What's the telemetry for search over the last week?"
- "Show me recent audit history for dark_mode"

## Development

```bash
npm install
npm run dev      # run with tsx
npm run build    # compile typescript
npm start        # run compiled
```

## License

MIT
