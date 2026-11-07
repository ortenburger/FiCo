# FiCo FastMCP

MCP server that exposes the **entire FiCo HTTP API** (ledger, policy gate, net tariffs, demo, gamification, vault, finanzmining) as FastMCP tools for Cursor / Claude / other agents.

## Prerequisites

1. FiCo API running (`pnpm --filter @fico/api dev`, default `http://127.0.0.1:3001`)
2. [uv](https://docs.astral.sh/uv/) (or `pip install -e .` in a venv)

## Run (stdio)

```bash
cd mcp
uv sync
FICO_API_BASE=http://127.0.0.1:3001 uv run fico-mcp
```

## Cursor

Add to your MCP config (e.g. `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "fico": {
      "command": "uv",
      "args": ["run", "--directory", "/absolute/path/to/FiCo/mcp", "fico-mcp"],
      "env": {
        "FICO_API_BASE": "http://127.0.0.1:3001",
        "FICO_DEMO_USER_ID": "00000000-0000-4000-8000-000000000001"
      }
    }
  }
}
```

## Tool groups

| Group | Tools |
|-------|--------|
| Health / catalog | `fico_health`, `list_datasources`, `get_datasource` |
| Demo (Lena) | `get_demo_snapshot`, `demo_check_in` |
| Ledger / regulatory | `ask_copilot`, `evaluate_waterfall`, `evaluate_policy_gate`, `evaluate_sca_health` |
| Net tariffs | `list_net_tariffs`, `compare_net_tariff`, `handoff_net_tariff_application` |
| Profile / vault | `get_profile`, `update_profile`, `list_documents`, `read_document`, `search_documents` |
| Gamification | `gamification_profile`, `gamification_snacks`, `gamification_check_in`, `gamification_snack_answer` |
| finanzmining | `finanzmining_contracts`, `finanzmining_statistics`, `finanzmining_predicted_transactions` |
| Local math | `altersvorsorge_compound_shock` |

Resources: `fico://health`, `fico://demo/snapshot`.
