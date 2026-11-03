const assert = require('assert');
const pkceChallenge = require('pkce-challenge').default;
const { app, authProvider, clients, authorizationCodes, accessTokens } = require('../server.js');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

async function runTests() {
  console.log('🚀 Starting Binance Agent Wallet MCP Test Suite...\n');

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      process.stdout.write(`Testing ${name}... `);
      await fn();
      console.log('✅ PASS');
      passed++;
    } catch (err) {
      console.log('❌ FAIL');
      console.error(err);
      failed++;
    }
  }

  let registeredClientId = null;
  let codeVerifier = null;
  let authCode = null;
  let accessToken = null;

  try {
    // 1. Health endpoint
    await test('Health endpoint (/health)', async () => {
      const res = await fetch(`${baseUrl}/health`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.deepStrictEqual(data, { status: 'ok' });
    });

    // 2. OAuth AS Discovery
    await test('OAuth 2.0 Authorization Server Discovery (RFC 8414)', async () => {
      const res = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.issuer, 'Missing issuer');
      assert.ok(data.authorization_endpoint, 'Missing authorization_endpoint');
      assert.ok(data.token_endpoint, 'Missing token_endpoint');
      assert.ok(data.registration_endpoint, 'Missing registration_endpoint');
      assert.ok(data.code_challenge_methods_supported.includes('S256'), 'S256 missing in code_challenge_methods_supported');
    });

    // 3. OAuth Protected Resource Metadata Discovery
    await test('OAuth 2.0 Protected Resource Metadata (RFC 9728)', async () => {
      const res1 = await fetch(`${baseUrl}/.well-known/oauth-protected-resource`);
      assert.strictEqual(res1.status, 200);
      const data1 = await res1.json();
      assert.ok(data1.resource, 'Missing resource in root PRM');

      const res2 = await fetch(`${baseUrl}/.well-known/oauth-protected-resource/mcp`);
      assert.strictEqual(res2.status, 200);
      const data2 = await res2.json();
      assert.ok(data2.resource, 'Missing resource in /mcp PRM');
      assert.ok(data2.scopes_supported.includes('mcp:tools'), 'mcp:tools scope missing');
    });

    // 4. Dynamic Client Registration (DCR)
    await test('Dynamic Client Registration (RFC 7591)', async () => {
      const res = await fetch(`${baseUrl}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: 'Claude Test Client',
          redirect_uris: ['http://127.0.0.1:8080/oauth/callback'],
          token_endpoint_auth_method: 'none',
          grant_types: ['authorization_code']
        })
      });
      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.ok(data.client_id, 'Missing client_id');
      assert.strictEqual(data.client_name, 'Claude Test Client');
      assert.deepStrictEqual(data.redirect_uris, ['http://127.0.0.1:8080/oauth/callback']);
      registeredClientId = data.client_id;
    });

    // 5. PKCE Authorization Flow
    await test('PKCE Authorization Request (/authorize)', async () => {
      const challenge = await pkceChallenge();
      codeVerifier = challenge.code_verifier;

      const authUrl = new URL(`${baseUrl}/authorize`);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', registeredClientId);
      authUrl.searchParams.set('redirect_uri', 'http://127.0.0.1:8080/oauth/callback');
      authUrl.searchParams.set('code_challenge', challenge.code_challenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('state', 'test-state-xyz');

      const res = await fetch(authUrl.toString(), { redirect: 'manual' });
      assert.strictEqual(res.status, 302);
      const location = res.headers.get('location');
      assert.ok(location, 'Missing redirect location header');

      const redirectUrl = new URL(location);
      assert.strictEqual(redirectUrl.searchParams.get('state'), 'test-state-xyz');
      authCode = redirectUrl.searchParams.get('code');
      assert.ok(authCode, 'Missing code in redirect');
    });

    // 6. Token Exchange Rejection with Invalid Code Verifier
    await test('Token Exchange Rejection with Invalid Code Verifier', async () => {
      const res = await fetch(`${baseUrl}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: registeredClientId,
          code: authCode,
          code_verifier: 'invalid_verifier_that_does_not_match',
          redirect_uri: 'http://127.0.0.1:8080/oauth/callback'
        }).toString()
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error, 'invalid_grant');
    });

    // 7. Token Exchange Success with Valid Code Verifier
    await test('Token Exchange Success with Valid Code Verifier (/token)', async () => {
      const res = await fetch(`${baseUrl}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: registeredClientId,
          code: authCode,
          code_verifier: codeVerifier,
          redirect_uri: 'http://127.0.0.1:8080/oauth/callback'
        }).toString()
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.access_token, 'Missing access_token');
      assert.strictEqual(data.token_type, 'Bearer');
      assert.ok(data.expires_in > 0, 'Invalid expires_in');
      accessToken = data.access_token;
    });

    // 8. Streamable HTTP /mcp Unauthorized Access
    await test('Streamable HTTP /mcp Rejects Unauthorized Requests (401)', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'unauth-client', version: '1.0.0' }
          }
        })
      });
      assert.strictEqual(res.status, 401);
      assert.ok(res.headers.get('www-authenticate'), 'Missing WWW-Authenticate header');
    });

    // 9. Streamable HTTP /mcp Authenticated Handshake & Tool Calls
    await test('Streamable HTTP MCP Client Connection and Tool Calls', async () => {
      const transport = new StreamableHTTPClientTransport(
        new URL(`${baseUrl}/mcp`),
        {
          requestInit: {
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          }
        }
      );

      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await client.connect(transport);

      // List tools
      const toolList = await client.listTools();
      const toolNames = toolList.tools.map(t => t.name);
      assert.ok(toolNames.includes('wallet_status'), 'Missing wallet_status tool');
      assert.ok(toolNames.includes('wallet_address'), 'Missing wallet_address tool');
      assert.ok(toolNames.includes('wallet_balance_bsc'), 'Missing wallet_balance_bsc tool');
      assert.strictEqual(toolNames.length, 3, 'Found extraneous tools');

      // Call wallet_status
      const statusRes = await client.callTool({ name: 'wallet_status', arguments: {} });
      assert.ok(statusRes.content && statusRes.content[0].text, 'wallet_status missing content');
      const statusData = JSON.parse(statusRes.content[0].text);
      assert.ok(statusData.status, 'status property missing');

      // Call wallet_address
      const addressRes = await client.callTool({ name: 'wallet_address', arguments: {} });
      assert.ok(addressRes.content && addressRes.content[0].text, 'wallet_address missing content');

      // Call wallet_balance_bsc
      const balanceRes = await client.callTool({
        name: 'wallet_balance_bsc',
        arguments: { symbol: 'BNB' }
      });
      assert.ok(balanceRes.content && balanceRes.content[0].text, 'wallet_balance_bsc missing content');

      await client.close();
    });

    // 10. Strictly Read-Only Integrity Verification
    await test('Strictly Read-Only Safety Verification', async () => {
      // Check that mutating commands like send, swap, sign, etc. are NOT in tool list
      const disallowed = [
        'send', 'swap', 'trade', 'transfer', 'sign', 'buy', 'sell',
        'cancel', 'order', 'withdraw', 'execute', 'approve'
      ];
      const { createMcpServer } = require('../server.js');
      const mcp = createMcpServer();
      const tools = Object.keys(mcp._registeredTools || {});
      for (const t of tools) {
        for (const forbidden of disallowed) {
          assert.strictEqual(
            t.toLowerCase().includes(forbidden),
            false,
            `Disallowed tool name detected: ${t}`
          );
        }
      }
    });

  } finally {
    server.close();
  }

  console.log('\n=======================================');
  console.log(`Results: ${passed} passed, ${failed} failed.`);
  console.log('=======================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTests().catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
