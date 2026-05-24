# Multi-Service SaaS Platform Deployment Guide

This repository provides a complete x402 payment-gated SaaS platform with 6 monetized API endpoints ready for deployment on Cloudflare Workers.

## 🚀 Available Services

| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /api/simulate` | $0.02 | AI-powered simulation sandbox using Grok AI |
| `POST /v1/company-angle` | $0.03 | Sales intelligence - one-sentence outreach angles |
| `POST /api/enrich` | $0.01 | Lead enrichment - extract business signals from websites |
| `POST /api/extract` | $0.01 | Content extraction - LLM-friendly structured content |
| `POST /api/compliance` | $0.02 | Compliance checker - detect trust signals and policies |
| `GET /premium/*` | $0.01 | Premium content access (wildcard route) |

### Built-in Endpoints (Always Free)
- `GET /__x402/health` - Health check
- `GET /__x402/config` - Configuration status
- `GET /__x402/protected` - Test payment flow ($0.01)

## 📋 Prerequisites

1. **Cloudflare Account** - [Sign up free](https://dash.cloudflare.com/sign-up)
2. **Wrangler CLI** - Already included as dev dependency
3. **Wallet with Base USDC** - For receiving payments
4. **XAI API Key** - Optional, for AI-powered endpoints ([Get key](https://x.ai))

## 🔧 Quick Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Secrets

Create `.dev.vars` for local development:

```bash
cp .dev.vars.example .dev.vars
```

Generate and add JWT secret:

```bash
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))" >> .dev.vars
```

**Optional:** Add XAI API key to `.dev.vars`:

```bash
echo "XAI_API_KEY=your-xai-api-key-here" >> .dev.vars
```

### 3. Test Locally

```bash
npm run dev
```

Visit `http://localhost:8787/__x402/health` to verify it's running.

### 4. Deploy to Production

#### Configure Production Secrets

```bash
# Required: JWT secret for authentication
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" | npx wrangler secret put JWT_SECRET

# Optional: XAI API key for AI endpoints
npx wrangler secret put XAI_API_KEY
```

#### Deploy

```bash
npm run deploy
```

Your worker will be deployed to: `https://x402-saas-platform.YOUR-SUBDOMAIN.workers.dev`

## 🔐 Payment Configuration (CDP-Compliant)

The configuration in `wrangler.jsonc` follows [CDP Quickstart for Sellers](https://docs.cdp.coinbase.com/cdp-apis/docs/x402-quickstart-sellers):

```jsonc
{
  "vars": {
    "PAY_TO": "0xed7d30e8bc643503f9da261ed8e623bb6ecf6189",
    "NETWORK": "base",
    "FACILITATOR_URL": "https://x402.org/facilitator"
  }
}
```

- **Network:** Base mainnet (EIP-155 chain ID: 8453)
- **Currency:** USDC
- **Protocol:** x402 v2.0
- **Settlement:** CDP facilitator handles payment verification

## 🌐 Custom Domain Deployment

To deploy on your custom domain, uncomment and configure `routes` in `wrangler.jsonc`:

```jsonc
{
  "routes": [
    {
      "pattern": "api.yourdomain.com/*",
      "zone_name": "yourdomain.com"
    }
  ]
}
```

Then deploy:

```bash
npm run deploy
```

## 🤖 Bot Management Filtering (Optional)

**Requires:** Cloudflare Bot Management for Enterprise

Enable "default closed" mode where humans pass free and bots must pay:

1. Uncomment the example in `PROTECTED_PATTERNS`
2. Configure `bot_score_threshold` (1-30, recommended: 30)
3. Add `except_detection_ids` for bots that should pass free

Example:

```jsonc
{
  "pattern": "/content/*",
  "price": "$0.25",
  "description": "Premium content - humans free, bots must pay",
  "bot_score_threshold": 30,
  "except_detection_ids": [
    120623194,  // Googlebot
    117479730,  // BingBot
    132995013,  // ChatGPT-User
    33564303    // Claude-User
  ]
}
```

## 📝 Service-Specific Requirements

### AI-Powered Endpoints

The following endpoints require `XAI_API_KEY`:

- `/api/simulate` - Shadow State Sandbox
- `/v1/company-angle` - Company Research Intelligence

Set the secret:

```bash
npx wrangler secret put XAI_API_KEY
```

Get your key from: https://x.ai

### Data Enrichment Endpoints

The following endpoints work without additional configuration:

- `/api/enrich` - Lead enrichment
- `/api/extract` - Content extraction
- `/api/compliance` - Compliance checking

These endpoints are implemented in the current codebase and use lightweight web scraping suitable for Cloudflare Workers.

## 🧪 Testing the Platform

### Test Payment Flow

```bash
npm run test:client
```

This will:
1. Request a protected endpoint
2. Receive 402 Payment Required
3. Make a payment on Base mainnet
4. Retry with payment proof
5. Receive JWT cookie and access content

### Test Individual Endpoints

```bash
# Health check (always free)
curl https://your-worker.workers.dev/__x402/health

# Configuration (always free)
curl https://your-worker.workers.dev/__x402/config

# Test payment (requires payment)
curl https://your-worker.workers.dev/__x402/protected
```

## 📊 Monitoring & Observability

Observability is enabled in `wrangler.jsonc`:

```jsonc
{
  "observability": {
    "enabled": true
  }
}
```

View logs and metrics in the [Cloudflare Dashboard](https://dash.cloudflare.com):

1. Go to **Workers & Pages**
2. Select your worker
3. Click **Logs** or **Metrics**

Or use Wrangler CLI:

```bash
npx wrangler tail
```

## 🔒 Security Best Practices

1. **Never commit secrets** - Use `.dev.vars` locally, `wrangler secret` in production
2. **Use HTTPS only** - JWT cookies have `Secure` flag
3. **Validate inputs** - All endpoints validate request payloads
4. **Rate limiting** - Consider Cloudflare Rate Limiting rules
5. **Monitor payments** - Track payment transactions on Base explorer

## 📚 Additional Resources

- [x402 Protocol Documentation](https://x402.org)
- [CDP x402 Quickstart](https://docs.cdp.coinbase.com/cdp-apis/docs/x402-quickstart-sellers)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler Configuration Reference](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Bot Management Documentation](https://developers.cloudflare.com/bots/)

## 🆘 Troubleshooting

### "JWT_SECRET not set" Error

```bash
npx wrangler secret put JWT_SECRET
```

### "XAI_API_KEY not set" (when using AI endpoints)

```bash
npx wrangler secret put XAI_API_KEY
```

### Payments Not Working

1. Verify `PAY_TO` address in `wrangler.jsonc`
2. Check `NETWORK` is set to `"base"` for mainnet
3. Ensure `FACILITATOR_URL` is correct
4. Check facilitator logs in Cloudflare dashboard

### Route Conflicts

If you see "route already exists" errors:

1. Check existing Workers don't use the same routes
2. Delete conflicting routes in Cloudflare Dashboard
3. Redeploy with `npm run deploy`

## 📈 Next Steps

1. **Register on CDP Bazaar** - Make your services discoverable to AI agents
2. **Add Custom Services** - Add more `PROTECTED_PATTERNS` for your use cases
3. **Implement Service Endpoints** - The pattern matching is ready, implement the business logic
4. **Monitor Usage** - Track which services are most popular
5. **Scale Pricing** - Adjust prices based on demand and costs

## 📄 License

See repository license file.
