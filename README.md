# Flipper Cloud MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server for [Flipper Cloud](https://www.flippercloud.io) feature flags. This allows AI assistants like Claude to read and manage your feature flags.

## Installation

```bash
npm install -g @flippercloud/mcp
```

Or run directly with npx:

```bash
npx @flippercloud/mcp
```

## Configuration

Set your Flipper Cloud token as an environment variable:

```bash
export FLIPPER_CLOUD_TOKEN=your_token_here
```

Get your token from [flippercloud.io/settings/tokens](https://www.flippercloud.io/settings/tokens).

### Token Permissions

- **Read-only tokens** can list and view features
- **Read-write tokens** can also enable/disable features, manage actors, groups, and expressions

## Usage with Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "flipper-cloud": {
      "command": "npx",
      "args": ["@flippercloud/mcp"],
      "env": {
        "FLIPPER_CLOUD_TOKEN": "your_token_here"
      }
    }
  }
}
```

## Available Tools

### Read Operations

- **list_features** - List all feature flags
- **get_feature** - Get details for a specific feature
- **get_audits** - Get audit log of recent changes (requires paid plan)

### Write Operations (require read-write token)

- **create_feature** - Create a new feature flag
- **delete_feature** - Permanently delete a feature flag
- **enable_feature** / **disable_feature** - Toggle a feature globally
- **enable_actor** / **disable_actor** - Enable/disable for a specific actor
- **enable_group** / **disable_group** - Enable/disable for a group
- **enable_percentage_of_actors** / **disable_percentage_of_actors** - Percentage rollouts
- **enable_expression** / **disable_expression** - Expression-based targeting

## Examples

Ask Claude things like:

- "List all my feature flags"
- "Enable the new_checkout feature for user 123"
- "Roll out dark_mode to 25% of users"
- "Enable premium_features for users with plan equal to 'pro'"
- "Disable the beta_search feature globally"

## Development

```bash
# Install dependencies
npm install

# Run in development
npm run dev

# Build
npm run build

# Run built version
npm start
```

## License

MIT
