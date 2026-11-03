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

### 3. Start the MCP Server
In the terminal, run:
```bash
npm start
```
You should see:
```text
Binance Agent Wallet MCP Server listening on port 3000
Health endpoint: http://localhost:3000/health
MCP endpoint: http://localhost:3000/mcp
OAuth Issuer URL: http://localhost:3000/
```

### 4. Port Forwarding & Connecting Claude
In GitHub Codespaces:
1. Tap the **Ports** tab at the bottom.
2. Port `3000` will be listed automatically.
3. Keep the port visibility **Private** for safety.
4. If testing Claude / MCP client locally, point your client configuration to:
   - **Streamable HTTP URL**: `http://localhost:3000/mcp`
   - **OAuth Discovery**: `http://localhost:3000/.well-known/oauth-authorization-server`

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
