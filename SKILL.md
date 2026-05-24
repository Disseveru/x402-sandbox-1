---
name: x402-saas-platform
description: Multi-service payment-gated API platform for autonomous agents with AI-powered analysis, data enrichment, and compliance checking
network: Base mainnet
payment_protocol: x402 v2.0
---

# x402 SaaS Platform - Payment-Gated Services for Autonomous Agents

A comprehensive suite of monetized APIs for autonomous agents using the x402 payment protocol on Base mainnet.

## Available Services

### 1. AI-Powered Simulation Sandbox (`/api/simulate`)
**Price:** $0.02 USDC per simulation
**Description:** Verify code, transactions, and payloads before execution using Grok AI analysis

**When to use:** When an agent needs to dry-run code, smart contracts, or API payloads to predict outcomes without committing resources

**Request:** POST JSON payload describing what to simulate
**Response:** AI analysis with success prediction, gas estimates, risk assessment, and step-by-step execution trace

---

### 2. Company Research Intelligence (`/v1/company-angle`)
**Price:** $0.03 USDC per analysis
**Description:** One-sentence outreach angle for sales, partnerships, and prospecting using XAI

**When to use:** For outbound sales, lead gen, recruiting, partnerships, and vendor prospecting that need targeted outreach angles

**Request:** `{ "company_name": "...", "domain": "...", "context": [...], "notes": "..." }`
**Response:** `{ "summary": "One actionable sentence describing the best outreach angle" }`

---

### 3. Lead Enrichment (`/api/enrich`)
**Price:** $0.01 USDC per enrichment
**Description:** Extract structured business signals from any website

**When to use:** When enriching prospect databases with company metadata, contact info, and classification

**Request:** Target URL or domain
**Response:** Normalized URL, page title, description, contact/about/pricing links, social profiles, category hints

---

### 4. Content Extraction (`/api/extract`)
**Price:** $0.01 USDC per extraction
**Description:** LLM-friendly structured content from any webpage

**When to use:** When preparing web content for LLM consumption, research, or knowledge base building

**Request:** Target URL
**Response:** Title, description, headings, key paragraphs, CTAs, FAQ blocks in clean JSON format

---

### 5. Compliance Checker (`/api/compliance`)
**Price:** $0.02 USDC per check
**Description:** Detect privacy policy, terms, refund policy, and trust signals (informational only, not legal advice)

**When to use:** For vendor vetting, due diligence, or risk assessment workflows

**Request:** Target URL or domain
**Response:** Privacy policy found, terms found, refund policy found, contact info, pricing, trust signals, risk flags

---

### 6. Premium Content Access (`/premium/*`)
**Price:** $0.01 USDC for 1-hour access
**Description:** General protected routes for custom premium content

**When to use:** For any custom protected content or proxied services requiring payment

---

## How to Use (x402 Protocol)

1. **Make initial request** to any protected endpoint
2. **Receive 402 Payment Required** response with payment details
3. **Send USDC payment** on Base mainnet to the specified address
4. **Retry request** with payment proof header `x-402-tx-hash`
5. **Receive JWT cookie** valid for 1 hour granting access to all services
6. **Make unlimited requests** to any service during the 1-hour session

## Payment Details
- **Network:** Base mainnet (EIP-155 chain ID: 8453)
- **Currency:** USDC
- **Payment Address:** `0xed7d30e8bc643503f9da261ed8e623bb6ecf6189`
- **Facilitator:** CDP x402 facilitator at `https://x402.org/facilitator`
- **Session Duration:** 1 hour after first payment

## Compliance
- CDP Quickstart for Sellers compliant
- x402 protocol v2.0 compliant
- Cloudflare Workers runtime compatible
- All prices in USD, settled in USDC on Base
