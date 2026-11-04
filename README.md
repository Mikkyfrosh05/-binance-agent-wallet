# Binance Agent Wallet MCP Server

A Model Context Protocol (MCP) server providing strictly read-only access to the **Binance Agentic Wallet** via Streamable HTTP (`/mcp`) and standard OAuth 2.0 with Dynamic Client Registration (RFC 7591) and PKCE (RFC 7636).

---

## 🔒 Security & Read-Only Guarantee

- **Strictly Read-Only**: Only inspection tools (`wallet_status`, `wallet_address`, `wallet_balance_bsc`) are exposed. No write operations (such as token transfers, swaps, contract calls, or order placement) are supported or accessible.
- **Credential Protection**: Wallet credentials, session files, and private keys are never committed, logged, or exposed across the network.
- **Local / Codespaces First**: Designed to run securely inside GitHub Codespaces without exposing sensitive endpoints to the public internet.

---

## 📱 Quickstart Guide for iPhone & GitHub Codespaces

If you are using GitHub Codespaces on Safari or Chrome on an iPhone, follow these simple steps:

### 1. Open Codespaces Terminal
- In your browser on your iPhone, open your Codespaces workspace for this repository.
- Tap the **Terminal** tab at the bottom (or tap the hamburger menu `☰` > **Terminal** > **New Terminal**).

### 2. Sign In to Binance Agentic Wallet (One-Time Setup)
In the terminal, run:
```bash
npx baw auth signin
```
- A QR code or verification link will appear in your terminal.
- Switch to your **Binance App** on your phone, tap the QR scanner icon (top right of the Binance app home screen), and approve the connection.
- Switch back to Codespaces: your wallet is now authenticated locally!

You can check status anytime with:
```bash
npx baw wallet status
```

### 3. Configure Public URL for Codespaces (MCP_PUBLIC_URL)

When hosting your server on GitHub Codespaces, you need the OAuth issuer and endpoints to advertise your HTTPS Codespaces URL instead of `localhost`.

You can set `MCP_PUBLIC_URL` using either method below:

#### Option A: Create or update a `.env` file (Recommended)
In the terminal, run:
```bash
echo "MCP_PUBLIC_URL=https://curly-space-enigma-q7v9qq499v95244p6-3000.app.github.dev" >> .env
```
*(Replace with your current Codespaces URL if your workspace domain changes.)*

#### Option B: Export the environment variable directly
```bash
export MCP_PUBLIC_URL="https://curly-space-enigma-q7v9qq499v95244p6-3000.app.github.dev"
```

---

### 4. Start the MCP Server
In the terminal, run:
```bash
npm start
```
You should see:
```text
Binance Agent Wallet MCP Server listening on port 3000
Health endpoint: https://curly-space-enigma-q7v9qq499v95244p6-3000.app.github.dev/health
MCP endpoint: https://curly-space-enigma-q7v9qq499v95244p6-3000.app.github.dev/mcp
OAuth Issuer URL: https://curly-space-enigma-q7v9qq499v95244p6-3000.app.github.dev/
```

---

### 5. Port Forwarding & Connecting Claude
In GitHub Codespaces:
1. Tap the **Ports** tab at the bottom.
2. Port `3000` will be listed automatically.
3. **Keep the port visibility Private** for security. Never change visibility to Public without authorization.
4. Point your Claude / MCP client configuration to your HTTPS endpoints:
   - **Streamable HTTP URL**: `https://curly-space-enigma-q7v9qq499v95244p6-3000.app.github.dev/mcp`
   - **OAuth Discovery**: `https://curly-space-enigma-q7v9qq499v95244p6-3000.app.github.dev/.well-known/oauth-authorization-server`

---

## 🛠 Available MCP Tools

All tools are strictly **read-only**:

| Tool | Parameters | Description |
|---|---|---|
| `wallet_status` | none | Checks connection and wallet status (`CONNECTED`, `CREATING`, `UNCONNECTED`). |
| `wallet_address` | none | Returns wallet addresses for supported EVM chains. |
| `wallet_balance_bsc` | `symbol` (optional), `hideLowValue` (optional) | Queries token balances on BNB Smart Chain (BSC, chain ID 56). |

---

## 🧪 Running Automated Tests

To run the automated test suite covering `/health`, OAuth AS Discovery, Protected Resource Metadata, Dynamic Client Registration, PKCE authorization flow, token exchange, and MCP tool execution:

```bash
npm test
```

Expected output:
```text
🚀 Starting Binance Agent Wallet MCP Test Suite...

Testing Health endpoint (/health)... ✅ PASS
Testing OAuth 2.0 Authorization Server Discovery (RFC 8414)... ✅ PASS
Testing OAuth 2.0 Protected Resource Metadata (RFC 9728)... ✅ PASS
Testing Dynamic Client Registration (RFC 7591)... ✅ PASS
Testing PKCE Authorization Request (/authorize)... ✅ PASS
Testing Token Exchange Rejection with Invalid Code Verifier... ✅ PASS
Testing Token Exchange Success with Valid Code Verifier (/token)... ✅ PASS
Testing Streamable HTTP /mcp Rejects Unauthorized Requests (401)... ✅ PASS
Testing Streamable HTTP MCP Client Connection and Tool Calls... ✅ PASS
Testing Strictly Read-Only Safety Verification... ✅ PASS

=======================================
Results: 10 passed, 0 failed.
=======================================
```

---

## 📄 License
MIT
