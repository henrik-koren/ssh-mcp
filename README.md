# SSH MCP Server

[![NPM Version](https://img.shields.io/npm/v/ssh-mcp)](https://www.npmjs.com/package/ssh-mcp)
[![Downloads](https://img.shields.io/npm/dm/ssh-mcp)](https://www.npmjs.com/package/ssh-mcp)
[![Node Version](https://img.shields.io/node/v/ssh-mcp)](https://nodejs.org/)
[![License](https://img.shields.io/github/license/tufantunc/ssh-mcp)](./LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/tufantunc/ssh-mcp?style=social)](https://github.com/tufantunc/ssh-mcp/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/tufantunc/ssh-mcp?style=social)](https://github.com/tufantunc/ssh-mcp/forks)
[![Build Status](https://github.com/tufantunc/ssh-mcp/actions/workflows/publish.yml/badge.svg)](https://github.com/tufantunc/ssh-mcp/actions)
[![GitHub issues](https://img.shields.io/github/issues/tufantunc/ssh-mcp)](https://github.com/tufantunc/ssh-mcp/issues)

[![Trust Score](https://archestra.ai/mcp-catalog/api/badge/quality/tufantunc/ssh-mcp)](https://archestra.ai/mcp-catalog/tufantunc__ssh-mcp)

**SSH MCP Server** is a Model Context Protocol (MCP) server that exposes SSH control for Linux and Windows systems, enabling LLMs and other MCP clients to execute shell commands securely via SSH.

Two transport modes are available:

| Mode | Transport | Use case |
|------|-----------|----------|
| **Stdio** (classic) | stdin/stdout | Single static host — one process per server |
| **HTTP** (new) | Streamable HTTP `POST /mcp` | Dynamic multi-host — one container for many servers |

## Contents

- [Quick Start](#quick-start)
- [Features](#features)
- [Installation](#installation)
- [Stdio Server — Single Host](#stdio-server--single-host)
  - [Client Setup](#client-setup)
  - [Claude Code](#claude-code)
- [HTTP Server — Dynamic Multi-Host](#http-server--dynamic-multi-host)
  - [Docker Quick Start](#docker-quick-start)
  - [Tools](#http-tools)
  - [MCP Client Configuration](#mcp-client-configuration-http)
  - [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Disclaimer](#disclaimer)
- [Support](#support)

## Quick Start

- [Install](#installation) SSH MCP Server
- Choose a transport mode:
  - **Single host** → [Configure the stdio server](#client-setup) and point your MCP client at it
  - **Multi-host / containerised** → [Pull and run the Docker image](#docker-quick-start) and point your MCP client at the HTTP endpoint
- Execute remote shell commands via natural language

## Features

- MCP-compliant server exposing SSH capabilities
- Execute shell commands on remote Linux and Windows systems
- Secure authentication via password or SSH key
- Built with TypeScript and the official MCP SDK
- **Two transport modes** — stdio for single-host setups, HTTP for dynamic multi-host deployments
- **Configurable timeout protection** with automatic process abortion
- **Graceful timeout handling** — attempts to kill hanging processes before closing connections
- **Docker image** published to GitHub Container Registry (`ghcr.io`) on every release

## Installation

### From npm (stdio server)

```bash
npx ssh-mcp -- --host=YOUR_HOST --user=YOUR_USER --password=YOUR_PASSWORD
```

### From source

1. **Clone the repository:**
   ```bash
   git clone https://github.com/tufantunc/ssh-mcp.git
   cd ssh-mcp
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```

### Docker (HTTP server)

```bash
docker pull ghcr.io/tufantunc/ssh-mcp:latest
```

---

## Stdio Server — Single Host

The stdio server connects to **one fixed SSH host** at startup. It is ideal for IDE integrations (Cursor, Windsurf, Claude Desktop, etc.) where each project targets a known server.

### Tools

- `exec`: Execute a shell command on the remote server
  - **Parameters:**
    - `command` (required): Shell command to execute on the remote SSH server
    - `description` (optional): Optional description of what this command will do (appended as a comment)

- `sudo-exec`: Execute a shell command with sudo elevation
  - **Parameters:**
    - `command` (required): Shell command to execute as root using sudo
    - `description` (optional): Optional description of what this command will do (appended as a comment)
  - **Notes:**
    - Requires `--sudoPassword` to be set for password-protected sudo
    - Can be disabled by passing the `--disableSudo` flag at startup if sudo access is not needed or not available
    - For persistent root access, consider using `--suPassword` instead which establishes a root shell
    - Tool will not be available at all if server is started with `--disableSudo`
  - **Timeout Configuration:**
    - Timeout is configured via command line argument `--timeout` (in milliseconds)
    - Default timeout: 60000ms (1 minute)
    - When a command times out, the server automatically attempts to abort the running process before closing the connection
  - **Max Command Length Configuration:**
    - Max command characters are configured via `--maxChars`
    - Default: `1000`
    - No-limit mode: set `--maxChars=none` or any `<= 0` value (e.g. `--maxChars=0`)

### Client Setup

You can configure your IDE or LLM like Cursor, Windsurf, Claude Desktop to use this MCP Server.

**Required Parameters:**
- `host`: Hostname or IP of the Linux or Windows server
- `user`: SSH username

**Optional Parameters:**
- `port`: SSH port (default: 22)
- `password`: SSH password (or use `key` for key-based auth)
- `key`: Path to private SSH key
- `sudoPassword`: Password for sudo elevation (when executing commands with sudo)
- `suPassword`: Password for su elevation (when you need a persistent root shell)
- `timeout`: Command execution timeout in milliseconds (default: 60000ms = 1 minute)
- `maxChars`: Maximum allowed characters for the `command` input (default: 1000). Use `none` or `0` to disable the limit.
- `disableSudo`: Flag to disable the `sudo-exec` tool completely. Useful when sudo access is not needed or not available.

```json
{
    "mcpServers": {
        "ssh-mcp": {
            "command": "npx",
            "args": [
                "ssh-mcp",
                "-y",
                "--",
                "--host=1.2.3.4",
                "--port=22",
                "--user=root",
                "--password=pass",
                "--key=path/to/key",
                "--timeout=30000",
                "--maxChars=none"
            ]
        }
    }
}
```

### Claude Code

You can add this MCP server to Claude Code using the `claude mcp add` command. This is the recommended method for Claude Code.

**Basic Installation:**

```bash
claude mcp add --transport stdio ssh-mcp -- npx -y ssh-mcp -- --host=YOUR_HOST --user=YOUR_USER --password=YOUR_PASSWORD
```

**Installation Examples:**

**With Password Authentication:**
```bash
claude mcp add --transport stdio ssh-mcp -- npx -y ssh-mcp -- --host=192.168.1.100 --port=22 --user=admin --password=your_password
```

**With SSH Key Authentication:**
```bash
claude mcp add --transport stdio ssh-mcp -- npx -y ssh-mcp -- --host=example.com --user=root --key=/path/to/private/key
```

**With Custom Timeout and No Character Limit:**
```bash
claude mcp add --transport stdio ssh-mcp -- npx -y ssh-mcp -- --host=192.168.1.100 --user=admin --password=your_password --timeout=120000 --maxChars=none
```

**With Sudo and Su Support:**
```bash
claude mcp add --transport stdio ssh-mcp -- npx -y ssh-mcp -- --host=192.168.1.100 --user=admin --password=your_password --sudoPassword=sudo_pass --suPassword=root_pass
```

**Installation Scopes:**

You can specify the scope when adding the server:

- **Local scope** (default): For personal use in the current project
  ```bash
  claude mcp add --transport stdio ssh-mcp --scope local -- npx -y ssh-mcp -- --host=YOUR_HOST --user=YOUR_USER --password=YOUR_PASSWORD
  ```

- **Project scope**: Share with your team via `.mcp.json` file
  ```bash
  claude mcp add --transport stdio ssh-mcp --scope project -- npx -y ssh-mcp -- --host=YOUR_HOST --user=YOUR_USER --password=YOUR_PASSWORD
  ```

- **User scope**: Available across all your projects
  ```bash
  claude mcp add --transport stdio ssh-mcp --scope user -- npx -y ssh-mcp -- --host=YOUR_HOST --user=YOUR_USER --password=YOUR_PASSWORD
  ```

**Verify Installation:**

After adding the server, restart Claude Code and ask Cascade to execute a command:
```
"Can you run 'ls -la' on the remote server?"
```

For more information about MCP in Claude Code, see the [official documentation](https://docs.claude.com/en/docs/claude-code/mcp).

---

## HTTP Server — Dynamic Multi-Host

The HTTP server exposes SSH execution over **Streamable HTTP** (`POST /mcp`). Unlike the stdio server, it accepts SSH connection parameters on **every tool call**, so a single running instance (or container) can reach any number of SSH hosts without restart.

This mode is designed for tools like [HolmesGPT](https://github.com/robusta-dev/holmesgpt) that orchestrate investigations across many servers.

### Docker Quick Start

**Pull the image:**
```bash
docker pull ghcr.io/tufantunc/ssh-mcp:latest
```

**Run the container:**
```bash
docker run -d \
  --name ssh-mcp \
  -p 8080:8080 \
  ghcr.io/tufantunc/ssh-mcp:latest
```

**Override the port or timeout:**
```bash
docker run -d \
  --name ssh-mcp \
  -p 9090:9090 \
  -e PORT=9090 \
  -e SSH_TIMEOUT_MS=120000 \
  ghcr.io/tufantunc/ssh-mcp:latest
```

**Verify it is running:**
```bash
curl http://localhost:8080/health
# {"status":"ok","service":"ssh-mcp-http","version":"1.5.0"}
```

### HTTP Tools

Both tools open a **fresh SSH connection per call** and close it immediately after the command completes.

#### `ssh_exec`

Execute a shell command on any SSH server.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `host` | string | yes | SSH server hostname or IP address |
| `port` | number | no | SSH port (default: `22`) |
| `user` | string | yes | SSH login username |
| `password` | string | one of | SSH password |
| `private_key` | string | one of | PEM-encoded SSH private key — raw text or base64-encoded |
| `command` | string | yes | Shell command to execute |

#### `ssh_sudo_exec`

Execute a shell command with `sudo` on any SSH server.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `host` | string | yes | SSH server hostname or IP address |
| `port` | number | no | SSH port (default: `22`) |
| `user` | string | yes | SSH login username |
| `password` | string | one of | SSH password |
| `private_key` | string | one of | PEM-encoded SSH private key — raw text or base64-encoded |
| `command` | string | yes | Shell command to execute as root |
| `sudo_password` | string | no | Password for `sudo`. Omit if passwordless sudo is configured. |

> Either `password` or `private_key` must be provided for both tools.

### MCP Client Configuration (HTTP)

Point your MCP client at the running container's `/mcp` endpoint.

**Generic JSON config:**
```json
{
    "mcpServers": {
        "ssh-mcp-http": {
            "transport": "http",
            "url": "http://localhost:8080/mcp"
        }
    }
}
```

**HolmesGPT (`holmesgpt_config.yaml`):**
```yaml
toolsets:
  - type: mcp
    name: ssh-mcp-http
    transport: http
    url: http://ssh-mcp:8080/mcp
```

**Claude Code (HTTP transport):**
```bash
claude mcp add --transport http ssh-mcp-http http://localhost:8080/mcp
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | TCP port the HTTP server listens on |
| `SSH_TIMEOUT_MS` | `60000` | SSH command execution timeout in milliseconds |

---

## Testing

You can use the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) for visual debugging of this MCP Server.

```sh
npm run inspect
```

## Disclaimer

SSH MCP Server is provided under the [MIT License](./LICENSE). Use at your own risk. This project is not affiliated with or endorsed by any SSH or MCP provider.

## Contributing

We welcome contributions! Please see our [Contributing Guidelines](./CONTRIBUTING.md) for more information.

## Code of Conduct

This project follows a [Code of Conduct](./CODE_OF_CONDUCT.md) to ensure a welcoming environment for everyone.

## Support

If you find SSH MCP Server helpful, consider starring the repository or contributing! Pull requests and feedback are welcome. 
