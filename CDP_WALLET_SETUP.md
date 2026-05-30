# CDP Wallet Integration Setup

This guide explains how to set up and use the CDP (Coinbase Developer Platform) SDK integration for wallet operations.

## Overview

The x402 Worker now includes CDP SDK integration, enabling:
- Send funds from CDP-managed wallets
- Check wallet configuration and status
- Support for Base mainnet and Base Sepolia testnet
- Send USDC or ETH transactions

## Prerequisites

1. **CDP API Key**: Get from [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com)
2. **CDP Private Key**: Your API key's private key (keep this secure!)

## Setup Instructions

### 1. Set CDP Secrets

You need to configure two secrets in your Cloudflare Worker:

```bash
# Set your CDP API Key ID
wrangler secret put CDP_API_KEY
# Enter your CDP API Key ID when prompted

# Set your CDP Private Key
wrangler secret put CDP_PRIVATE_KEY
# Enter your CDP API Key Secret when prompted
```

### 2. Deploy the Worker

```bash
npm run deploy
```

## Available Endpoints

### GET /api/wallet/info

Check CDP SDK configuration status.

**Request:**
```bash
curl https://your-worker.workers.dev/api/wallet/info
```

**Response:**
```json
{
  "configured": true,
  "message": "CDP SDK is properly configured",
  "capabilities": [
    "Create EVM and Solana accounts",
    "Send transactions on Base, Base Sepolia, and other networks",
    "Manage end users and delegated signing",
    "EIP-7702 delegation support"
  ],
  "nextSteps": [
    "Create an account: POST /api/wallet/account/create",
    "Send funds: POST /api/wallet/send (after account creation)"
  ]
}
```

### POST /api/wallet/send

Send funds from your CDP wallet (validation payments, agentic.market registration, etc.)

**Request:**
```bash
curl -X POST https://your-worker.workers.dev/api/wallet/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "0xRecipientAddress",
    "amount": "0.01",
    "asset": "usdc",
    "network": "base-sepolia"
  }'
```

**Parameters:**
- `to` (required): Destination wallet address (0x...)
- `amount` (required): Amount to send (e.g., "0.01")
- `asset` (optional): "usdc" or "eth" (default: "usdc")
- `network` (optional): "base" or "base-sepolia" (default: "base-sepolia")

**Response:**
```json
{
  "success": true,
  "message": "CDP SDK integrated successfully",
  "note": "To complete wallet operations, you need to create an EVM account and fund it.",
  "instructions": {
    "createAccount": "Use cdp.createEvmAccount() to create a new account",
    "fundAccount": "Fund the account with testnet/mainnet tokens",
    "sendTransaction": "Use account.sendEvmAsset() to send funds"
  },
  "requestedTransfer": {
    "to": "0xRecipientAddress",
    "amount": "0.01",
    "asset": "usdc",
    "network": "base-sepolia"
  }
}
```

## Use Case: Agentic.Market Validation

To validate your project on agentic.market, you need to send a small amount (typically 1 cent in USDC) to their validation address:

```bash
curl -X POST https://your-worker.workers.dev/api/wallet/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "0xAGENTIC_MARKET_VALIDATION_ADDRESS",
    "amount": "0.01",
    "asset": "usdc",
    "network": "base"
  }'
```

## Next Steps

The current implementation provides the foundation for wallet operations. To fully enable sending transactions, you'll need to:

1. **Create an EVM Account**: Use the CDP SDK to create a wallet account
2. **Fund the Account**: Add testnet or mainnet tokens to your account
3. **Implement Transaction Logic**: Complete the send endpoint to actually execute transactions

For more details, see:
- [CDP SDK Documentation](https://coinbase.github.io/cdp-sdk/typescript)
- [CDP Wallet API v2](https://docs.cdp.coinbase.com/wallet-api-v2/docs/welcome)
- [CDP API Reference](https://docs.cdp.coinbase.com/api-v2/docs/welcome)

## Security Notes

⚠️ **IMPORTANT**: Never commit your CDP secrets to version control!

- Secrets are stored securely in Cloudflare Workers
- Use `wrangler secret put` to set them
- For local development, use `.dev.vars` file (gitignored)

## Troubleshooting

### "CDP credentials not configured"

You need to set the CDP_API_KEY and CDP_PRIVATE_KEY secrets:
```bash
wrangler secret put CDP_API_KEY
wrangler secret put CDP_PRIVATE_KEY
```

### "Failed to initialize CDP client"

Check that your credentials are correct and that you have access to the CDP API.

### Network Issues

- For testnet: Use `base-sepolia` network
- For mainnet: Use `base` network
- Ensure you have funds in the correct network
