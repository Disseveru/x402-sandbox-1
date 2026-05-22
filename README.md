# Paid Company Angle API (Cloudflare Worker + x402 + XAI)

This repository is a purpose-built Cloudflare Worker product for autonomous agents.

It exposes a paid endpoint:

- `POST /v1/company-angle`

The endpoint is x402 payment-gated (HTTP 402 for unpaid requests) and returns exactly one actionable sentence in JSON.

## What it does

Input (JSON):

- `company_name?: string`
- `domain?: string`
- `context?: string[]`
- `notes?: string`

Output (JSON):

```json
{ "summary": "..." }
```

## API routes

- `POST /v1/company-angle` (paid)
- `GET /__x402/health` (public)
- `GET /__x402/config` (public, no secret values exposed)

## Payment gating behavior (x402)

`/v1/company-angle` is protected using x402 middleware.

- Unpaid/invalid payment requests receive HTTP `402` with x402-style payment requirements.
- Paid requests are processed and sent to XAI.

Pricing and protected route configuration are in `wrangler.jsonc` under `PROTECTED_PATTERNS`.

## Local development

### 1) Install

```bash
npm install
```

### 2) Configure secrets

Copy and populate local secrets:

```bash
cp .dev.vars.example .dev.vars
```

Required secret in `.dev.vars`:

```bash
XAI_API_KEY=your-xai-api-key-here
```

### 3) Run locally

```bash
npm run dev
```

Worker runs at `http://localhost:8787`.

## Request/response examples

### Example request

```bash
curl -X POST "http://localhost:8787/v1/company-angle" \
  -H "content-type: application/json" \
  -H "x-payment: <base64-x402-payment>" \
  -d '{
    "company_name": "Acme",
    "domain": "acme.com",
    "context": [
      "Recently launched an enterprise plan",
      "Hiring customer success managers"
    ],
    "notes": "Prioritize practical outbound messaging"
  }'
```

### Example success response

```json
{
	"summary": "Acme is likely focused on scaling enterprise customer outcomes, so the strongest angle is helping customer success leaders reduce onboarding friction while improving expansion readiness."
}
```

### Example unpaid response (shape varies by x402 middleware)

Status: `402 Payment Required`

```json
{
	"error": "payment_required"
}
```

## Configuration

`wrangler.jsonc` includes:

- `PAY_TO` - wallet address receiving payment
- `NETWORK` - chain/network (for example `base-sepolia` or `base`)
- `PROTECTED_PATTERNS` - route pricing and descriptions (includes `/v1/company-angle`)
- `FACILITATOR_URL` - x402 facilitator URL
- `XAI_MODEL` - optional XAI model override (`grok-3-mini` default in code)

## Deployment

1. Set secrets in Cloudflare:

```bash
wrangler secret put XAI_API_KEY
```

2. Deploy:

```bash
npm run deploy
```

## Validation scripts

```bash
npm run typecheck
npm run lint
npm test
```
