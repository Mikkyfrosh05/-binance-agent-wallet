const crypto = require('crypto');
const { execFile } = require('child_process');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { isInitializeRequest } = require('@modelcontextprotocol/sdk/types.js');
const { z } = require('zod');

const {
  mcpAuthRouter,
  mcpAuthMetadataRouter,
  createOAuthMetadata,
  getOAuthProtectedResourceMetadataUrl
} = require('@modelcontextprotocol/sdk/server/auth/router.js');
const { requireBearerAuth } = require('@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js');

// Allow HTTP issuer URLs for local development and Codespaces testing if not configured
if (!process.env.MCP_DANGEROUSLY_ALLOW_INSECURE_ISSUER_URL) {
  process.env.MCP_DANGEROUSLY_ALLOW_INSECURE_ISSUER_URL = 'true';
}

const app = express();
const PORT = process.env.PORT || 3000;
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;
const issuerUrl = new URL(SERVER_URL);
const mcpResourceUrl = new URL('/mcp', issuerUrl);

// In-memory storage for OAuth state
const clients = new Map();
const authorizationCodes = new Map();
const accessTokens = new Map();

// Helper to run `baw` safely in strictly read-only mode
function runBawCommand(args) {
  return new Promise((resolve) => {
    // Only allow strictly approved read-only subcommands
    const safeArgs = args.filter((arg) => typeof arg === 'string' && !arg.includes(';'));

    execFile('npx', ['baw', ...safeArgs], { timeout: 15000 }, (error, stdout, stderr) => {
      let parsed = null;
      try {
        parsed = JSON.parse(stdout.trim());
      } catch (e) {
        // Not JSON
      }

      if (parsed) {
        resolve({ success: parsed.success !== false, data: parsed.data, error: parsed.error, raw: stdout });
      } else {
        resolve({
          success: !error,
          raw: stdout || stderr,
          error: error ? { message: stderr.trim() || error.message } : null
        });
      }
    });
  });
}

// In-memory OAuth Provider
const authProvider = {
  clientsStore: {
    getClient: async (clientId) => {
      return clients.get(clientId);
    },
    registerClient: async (clientMetadata) => {
      clients.set(clientMetadata.client_id, clientMetadata);
      return clientMetadata;
    }
  },

  authorize: async (client, params, res) => {
    const code = crypto.randomUUID();
    authorizationCodes.set(code, {
      client,
      params,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    });

    const targetUrl = new URL(params.redirectUri);
    targetUrl.searchParams.set('code', code);
    if (params.state !== undefined) {
      targetUrl.searchParams.set('state', params.state);
    }
    res.redirect(302, targetUrl.toString());
  },

  challengeForAuthorizationCode: async (client, authorizationCode) => {
    const codeData = authorizationCodes.get(authorizationCode);
    if (!codeData) {
      throw new Error('Invalid or expired authorization code');
    }
    if (Date.now() > codeData.expiresAt) {
      authorizationCodes.delete(authorizationCode);
      throw new Error('Authorization code expired');
    }
    return codeData.params.codeChallenge;
  },

  exchangeAuthorizationCode: async (client, authorizationCode, codeVerifier, redirectUri, resource) => {
    const codeData = authorizationCodes.get(authorizationCode);
    if (!codeData) {
      throw new Error('Invalid or expired authorization code');
    }
    if (codeData.client.client_id !== client.client_id) {
      throw new Error('Authorization code was not issued to this client');
    }
    authorizationCodes.delete(authorizationCode);

    const token = crypto.randomUUID();
    const expiresIn = 3600; // 1 hour
    const scopes = (codeData.params.scopes && codeData.params.scopes.length > 0)
      ? codeData.params.scopes
      : ['mcp:tools'];

    const tokenData = {
      token,
      clientId: client.client_id,
      scopes,
      expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
      resource: resource || mcpResourceUrl
    };
    accessTokens.set(token, tokenData);

    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: expiresIn,
      scope: tokenData.scopes.join(' ')
    };
  },

  verifyAccessToken: async (token) => {
    const tokenInfo = accessTokens.get(token);
    if (!tokenInfo) {
      throw new Error('Invalid or unknown access token');
    }
    if (tokenInfo.expiresAt < Math.floor(Date.now() / 1000)) {
      accessTokens.delete(token);
      throw new Error('Access token has expired');
    }
    return tokenInfo;
  },

  revokeToken: async (client, token) => {
    accessTokens.delete(token);
  }
};

// Standard middleware
app.use(cors());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// OAuth 2.0 Router (Discovery, Registration, Authorize, Token, PRM)
const oauthMetadata = createOAuthMetadata({
  provider: authProvider,
  issuerUrl,
  scopesSupported: ['mcp:tools']
});

app.use(mcpAuthRouter({
  provider: authProvider,
  issuerUrl,
  resourceServerUrl: mcpResourceUrl,
  scopesSupported: ['mcp:tools'],
  resourceName: 'Binance Agent Wallet',
  clientRegistrationOptions: {
    rateLimit: false
  },
  authorizationOptions: {
    rateLimit: false
  },
  tokenOptions: {
    rateLimit: false
  }
}));

// Also serve root PRM for clients that query /.well-known/oauth-protected-resource
app.use(mcpAuthMetadataRouter({
  oauthMetadata,
  resourceServerUrl: issuerUrl,
  scopesSupported: ['mcp:tools'],
  resourceName: 'Binance Agent Wallet'
}));

// Create and configure MCP server with strictly read-only tools
function createMcpServer() {
  const mcpServer = new McpServer({
    name: 'binance-agent-wallet',
    version: '1.0.0'
  });

  // Tool 1: wallet_status
  mcpServer.tool(
    'wallet_status',
    'Check authentication status and wallet creation status of the Binance Agentic Wallet (read-only)',
    {},
    async () => {
      const res = await runBawCommand(['wallet', 'status', '--json']);
      if (res.data) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(res.data, null, 2)
            }
          ]
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'UNCONNECTED',
              message: 'Binance Agentic Wallet is not signed in yet. Run `npx baw auth signin` in the terminal to sign in via the Binance app.'
            }, null, 2)
          }
        ]
      };
    }
  );

  // Tool 2: wallet_address
  mcpServer.tool(
    'wallet_address',
    'Get wallet addresses for supported chains from the Binance Agentic Wallet (read-only)',
    {},
    async () => {
      const res = await runBawCommand(['wallet', 'address', '--json']);
      if (res.success && res.data) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(res.data, null, 2)
            }
          ]
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Wallet not authenticated or addresses not found',
              details: res.error || res.raw || 'User is not logged in. Run `npx baw auth signin`.'
            }, null, 2)
          }
        ]
      };
    }
  );

  // Tool 3: wallet_balance_bsc
  mcpServer.tool(
    'wallet_balance_bsc',
    'Query token balances on BNB Smart Chain (BSC, chain ID 56) (read-only)',
    {
      symbol: z.string().optional().describe('Filter by token symbol (e.g., BNB, USDT)'),
      hideLowValue: z.boolean().optional().describe('Hide tokens worth under $0.01 (default: true)')
    },
    async ({ symbol, hideLowValue }) => {
      const args = ['wallet', 'balance', '--binanceChainId', '56', '--json'];
      if (symbol) {
        args.push('--symbol', symbol);
      }
      if (hideLowValue !== undefined) {
        args.push('--hideLowValue', String(hideLowValue));
      }
      const res = await runBawCommand(args);
      if (res.success && res.data) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(res.data, null, 2)
            }
          ]
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Failed to query BSC wallet balance',
              details: res.error || res.raw || 'User is not logged in. Run `npx baw auth signin`.'
            }, null, 2)
          }
        ]
      };
    }
  );

  return mcpServer;
}

// MCP Session Management for Streamable HTTP transport
const sessions = new Map();
const MAX_SESSIONS = 1000;
const IDLE_MS = 30 * 60 * 1000;

setInterval(() => {
  const cutoff = Date.now() - IDLE_MS;
  for (const [sessionId, session] of sessions.entries()) {
    if (session.open === 0 && session.lastActive < cutoff) {
      session.transport.close().catch(console.error);
      sessions.delete(sessionId);
    }
  }
}, 60000).unref();

const trackResponse = (session, res) => {
  if (!res.socket || res.destroyed) return;
  session.open++;
  res.on('close', () => {
    session.open--;
    session.lastActive = Date.now();
  });
};

const authMiddleware = requireBearerAuth({
  verifier: authProvider,
  requiredScopes: ['mcp:tools'],
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpResourceUrl)
});

// Streamable HTTP POST endpoint
app.post('/mcp', express.json(), authMiddleware, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  try {
    const session = sessionId ? sessions.get(sessionId) : undefined;
    let transport;

    if (session) {
      transport = session.transport;
      trackResponse(session, res);
    } else if (!sessionId && isInitializeRequest(req.body)) {
      if (sessions.size >= MAX_SESSIONS) {
        return res.status(503).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Too many open sessions' },
          id: null
        });
      }

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (sid) => {
          sessions.set(sid, { transport, open: 0, lastActive: Date.now() });
        }
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && sessions.has(sid)) {
          sessions.delete(sid);
        }
      };

      const server = createMcpServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else if (sessionId) {
      return res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Session not found' },
        id: null
      });
    } else {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
        id: null
      });
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null
      });
    }
  }
});

// Streamable HTTP GET endpoint (SSE stream)
app.get('/mcp', authMiddleware, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId) {
    return res.status(400).send('Missing session ID');
  }
  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Session not found' },
      id: null
    });
  }
  trackResponse(session, res);
  await session.transport.handleRequest(req, res);
});

// Streamable HTTP DELETE endpoint (Session termination)
app.delete('/mcp', authMiddleware, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId) {
    return res.status(400).send('Missing session ID');
  }
  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Session not found' },
      id: null
    });
  }
  trackResponse(session, res);
  await session.transport.handleRequest(req, res);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Binance Agent Wallet MCP Server listening on port ${PORT}`);
    console.log(`Health endpoint: ${SERVER_URL}/health`);
    console.log(`MCP endpoint: ${SERVER_URL}/mcp`);
    console.log(`OAuth Issuer URL: ${issuerUrl.href}`);
  });
}

module.exports = {
  app,
  authProvider,
  createMcpServer,
  runBawCommand,
  clients,
  authorizationCodes,
  accessTokens,
  sessions
};
