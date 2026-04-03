#!/usr/bin/env node

/**
 * SSH MCP HTTP Server — dynamic multi-host SSH execution via Model Context Protocol.
 *
 * Unlike the stdio server (index.ts) which connects to a single static host at startup,
 * this HTTP server accepts SSH connection parameters (host, user, password/key) on every
 * tool call, enabling HolmesGPT (and other MCP clients) to reach different servers per
 * investigation without restarting the container.
 *
 * Transport: Streamable HTTP (POST /mcp), stateless mode — one MCP session per request.
 * Each tool call opens a fresh SSH connection, executes, and closes it.
 *
 * Start: node build/http-server.js   (PORT env var, default 8080)
 */

import express, { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { Client, ClientChannel } from 'ssh2';
import { z } from 'zod';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;
const DEFAULT_TIMEOUT_MS = process.env.SSH_TIMEOUT_MS
  ? parseInt(process.env.SSH_TIMEOUT_MS)
  : 60_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SshConnectConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}

// ---------------------------------------------------------------------------
// Core SSH execution (per-call, fresh connection)
// ---------------------------------------------------------------------------

/**
 * Opens an SSH connection using the given config, runs `command`, returns stdout.
 * Rejects if stderr is non-empty (matches upstream ssh-mcp behaviour).
 * Always closes the connection when done.
 */
function runSshCommand(
  config: SshConnectConfig,
  command: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;

    const done = (err?: Error, result?: string) => {
      if (settled) return;
      settled = true;
      conn.end();
      if (err) reject(err);
      else resolve(result ?? '');
    };

    const timer = setTimeout(() => {
      done(
        new McpError(
          ErrorCode.InternalError,
          `SSH command timed out after ${DEFAULT_TIMEOUT_MS}ms`,
        ),
      );
    }, DEFAULT_TIMEOUT_MS);

    conn.on('ready', () => {
      conn.exec(command, (err: Error | undefined, stream: ClientChannel) => {
        if (err) {
          clearTimeout(timer);
          done(new McpError(ErrorCode.InternalError, `SSH exec error: ${err.message}`));
          return;
        }

        let stdout = '';
        let stderr = '';

        try { stream.end(); } catch (_) { /* ignore */ }

        stream.on('data', (data: Buffer) => { stdout += data.toString(); });
        stream.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

        stream.on('close', (code: number) => {
          clearTimeout(timer);
          if (stderr) {
            done(
              new McpError(
                ErrorCode.InternalError,
                `Command failed (exit ${code}):\n${stderr}`,
              ),
            );
          } else {
            done(undefined, stdout);
          }
        });
      });
    });

    conn.on('error', (err: Error) => {
      clearTimeout(timer);
      done(new McpError(ErrorCode.InternalError, `SSH connection error: ${err.message}`));
    });

    conn.connect(config);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Decode a private key that may be either a raw PEM string or base64-encoded PEM.
 */
function decodePrivateKey(raw: string): string {
  if (raw.startsWith('-----')) return raw;
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    if (decoded.startsWith('-----')) return decoded;
  } catch (_) { /* fall through */ }
  return raw;
}

function buildConnectConfig(params: {
  host: string;
  port?: number;
  user: string;
  password?: string;
  private_key?: string;
}): SshConnectConfig {
  if (!params.password && !params.private_key) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Either password or private_key must be provided',
    );
  }

  const cfg: SshConnectConfig = {
    host: params.host,
    port: params.port ?? 22,
    username: params.user,
  };

  if (params.password) {
    cfg.password = params.password;
  } else if (params.private_key) {
    cfg.privateKey = decodePrivateKey(params.private_key);
  }

  return cfg;
}

/** Wrap a command with sudo, optionally piping in a password. */
function wrapSudo(command: string, sudoPassword?: string): string {
  const escaped = command.replace(/'/g, "'\\''");
  if (!sudoPassword) {
    return `sudo -n sh -c '${escaped}'`;
  }
  const pwdEscaped = sudoPassword.replace(/'/g, "'\\''");
  return `printf '%s\\n' '${pwdEscaped}' | sudo -p "" -S sh -c '${escaped}'`;
}

// ---------------------------------------------------------------------------
// MCP Server factory
// ---------------------------------------------------------------------------

function makeMcpServer(): McpServer {
  const server = new McpServer({
    name: 'SSH MCP HTTP Server',
    version: '1.5.0',
    capabilities: { tools: {} },
  });

  // ------------------------------------------------------------------
  // Tool: ssh_exec
  // ------------------------------------------------------------------
  server.tool(
    'ssh_exec',
    'Execute a shell command on any remote SSH server. ' +
    'Dynamically connects to the specified host using password or SSH private key authentication. ' +
    'A fresh connection is opened per call so each investigation can target a different machine. ' +
    'Returns stdout; fails if stderr is non-empty.',
    {
      host: z.string().describe('SSH server hostname or IP address'),
      port: z.number().int().min(1).max(65535).optional().default(22).describe('SSH port (default: 22)'),
      user: z.string().describe('SSH login username'),
      password: z.string().optional().describe(
        'SSH password. Provide either password or private_key, not both.',
      ),
      private_key: z.string().optional().describe(
        'PEM-encoded SSH private key (raw text or base64-encoded). ' +
        'Provide either password or private_key, not both.',
      ),
      command: z.string().describe('Shell command to execute on the remote server'),
    },
    async ({ host, port, user, password, private_key, command }) => {
      const cfg = buildConnectConfig({ host, port, user, password, private_key });
      const output = await runSshCommand(cfg, command);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  // ------------------------------------------------------------------
  // Tool: ssh_sudo_exec
  // ------------------------------------------------------------------
  server.tool(
    'ssh_sudo_exec',
    'Execute a shell command with sudo on any remote SSH server. ' +
    'Dynamically connects using password or SSH private key authentication. ' +
    'A fresh connection is opened per call. ' +
    'If sudo_password is omitted, passwordless sudo is assumed (uses sudo -n).',
    {
      host: z.string().describe('SSH server hostname or IP address'),
      port: z.number().int().min(1).max(65535).optional().default(22).describe('SSH port (default: 22)'),
      user: z.string().describe('SSH login username'),
      password: z.string().optional().describe(
        'SSH password. Provide either password or private_key, not both.',
      ),
      private_key: z.string().optional().describe(
        'PEM-encoded SSH private key (raw text or base64-encoded). ' +
        'Provide either password or private_key, not both.',
      ),
      command: z.string().describe('Shell command to execute on the remote server'),
      sudo_password: z.string().optional().describe(
        'Password for sudo. Omit if passwordless sudo is configured on the target host.',
      ),
    },
    async ({ host, port, user, password, private_key, command, sudo_password }) => {
      const cfg = buildConnectConfig({ host, port, user, password, private_key });
      const wrapped = wrapSudo(command, sudo_password);
      const output = await runSshCommand(cfg, wrapped);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  return server;
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const app = express();
  app.use(express.json());

  // Health check — used by K8s readiness/liveness probes
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'ssh-mcp-http', version: '1.5.0' });
  });

  // MCP endpoint — stateless: each POST creates an independent MCP session
  app.post('/mcp', async (req: Request, res: Response) => {
    try {
      const mcpServer = makeMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless mode
      });
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('MCP request error:', msg);
      if (!res.headersSent) {
        res.status(500).json({ error: msg });
      }
    }
  });

  app.listen(PORT, () => {
    console.error(`SSH MCP HTTP Server listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
