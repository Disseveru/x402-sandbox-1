# CDP API Key Format Guide

## Issue: "Invalid key format" Error

If you're seeing this error when trying to use CDP wallet operations:

```
UserInputValidationError: Invalid key format - must be either PEM EC key or base64 Ed25519 key
```

This means the `CDP_PRIVATE_KEY` secret is not in the correct format.

## Correct Format

The `CDP_PRIVATE_KEY` should contain the **entire JSON content** from the CDP API key file you downloaded from [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com), NOT just the private key string.

### ✅ Correct Format (Full JSON)

When you create an API key in the CDP Portal, you download a JSON file that looks like this:

```json
{
  "name": "your-api-key-name",
  "privateKey": "-----BEGIN EC PRIVATE KEY-----\nMHcC...full PEM key here...\n-----END EC PRIVATE KEY-----",
  "publicKey": "...",
  ... other fields ...
}
```

**The entire JSON object should be used as the CDP_PRIVATE_KEY secret.**

### ❌ Incorrect Format (Just the Key String)

Do NOT use just the base64 string or just the privateKey value:

```
ssMKoIesWAwKRQRnKz+yDkWPr5FEoE76jSJQ7KyVn/BO2VDcTI...
```

This will cause the "Invalid key format" error.

## How to Fix

### Step 1: Get the Full API Key JSON

1. Go to [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com)
2. Navigate to API Keys section
3. Either:
   - Create a new API key and download the JSON file, OR
   - Find your existing API key - you should have saved the JSON when you created it

### Step 2: Upload the Full JSON as Secret

The `CDP_PRIVATE_KEY` secret should be the complete JSON string from the file.

**Option A: From Downloaded File**

```bash
# If you have the downloaded JSON file:
cat cdp-api-key.json | npx wrangler secret put CDP_PRIVATE_KEY
```

**Option B: Manual Entry**

```bash
npx wrangler secret put CDP_PRIVATE_KEY
# When prompted, paste the entire JSON content (all on one line or properly formatted)
```

### Step 3: Also Set CDP_API_KEY

The `CDP_API_KEY` is the API Key ID (looks like a UUID), found in the JSON as the `name` field or shown in the CDP Portal.

```bash
npx wrangler secret put CDP_API_KEY
# Enter the API Key ID when prompted (e.g., "organizations/...")
```

## Alternative: Using Individual Fields

If you don't have the full JSON, the CDP SDK can also accept the private key in PEM format directly:

```
-----BEGIN EC PRIVATE KEY-----
MHcCAQEEII...your key data here...
-----END EC PRIVATE KEY-----
```

Or a base64-encoded Ed25519 key (44 or 88 characters).

## Verification

After setting the correct format, test that it works:

```bash
curl https://your-worker.workers.dev/api/wallet/info
```

You should see:

```json
{
  "configured": true,
  "message": "CDP SDK is properly configured",
  ...
}
```

And wallet operations should work:

```bash
curl -X POST https://your-worker.workers.dev/api/wallet/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "0xRecipientAddress",
    "amount": "0.001",
    "asset": "usdc",
    "network": "base-sepolia"
  }'
```

## GitHub Secrets Configuration

If you're using GitHub Actions, make sure your repository secrets are set correctly:

1. **CDP_API_KEY**: The API Key ID from the CDP Portal
2. **CDP_PRIVATE_KEY**: The **full JSON content** from the downloaded API key file
3. **CDP_WALLET_SECRET**: The wallet secret (if using an existing funded wallet)

## Additional Resources

- [CDP Portal](https://portal.cdp.coinbase.com) - Create and manage API keys
- [CDP SDK Documentation](https://coinbase.github.io/cdp-sdk/typescript) - TypeScript SDK reference
- [CDP API Keys Guide](https://docs.cdp.coinbase.com/cdp-apis/docs/api-keys) - Official documentation

## Summary

**Key Point**: The `CDP_PRIVATE_KEY` secret must contain the complete JSON object from the CDP Portal download, not just the private key string.

If you continue to have issues, verify:
1. You're using the full JSON from the CDP Portal
2. The JSON is valid (you can validate with `cat file.json | jq .`)
3. Both CDP_API_KEY and CDP_PRIVATE_KEY are configured
4. The API key is active in the CDP Portal
