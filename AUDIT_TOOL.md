# x402 Security Audit & Remediation Tool

## Overview

The `audit-and-fix-x402.ts` script is a comprehensive security remediation and fixer agent designed for the x402 Cloudflare Worker repository. It acts as a Principal Security Engineer and Web3 DevOps Architect, automatically detecting and fixing common security and runtime configuration issues.

## Features

### ✅ Automated Configuration Scanning

The tool performs the following security checks:

1. **Wrangler Configuration - Sensitive Variables**
   - Scans `wrangler.jsonc` and `wrangler.toml` for sensitive variables in the `[vars]` block
   - Detects patterns like: `PRIVATE_KEY`, `SECRET`, `API_KEY`, `PASSWORD`, `TOKEN`, `FACILITATOR_URL`, `WALLET_ADDRESS`
   - **Fix mode**: Adds warnings to move sensitive variables to `.dev.vars` or Cloudflare secrets

2. **Gitignore Configuration**
   - Validates that `.gitignore` exists and contains required entries
   - Required entries: `.dev.vars`, `.env`, `node_modules`
   - **Fix mode**: Creates `.gitignore` if missing, appends missing entries

3. **Hono Environment Bindings**
   - Checks for Node.js-style `process.env` usage in Cloudflare Workers
   - Ensures proper usage of Hono's `c.env` pattern for Cloudflare compatibility
   - **Fix mode**: Automatically rewrites `process.env.VAR` to `c.env.VAR`

4. **Hono Error Handler**
   - Verifies presence of `app.onError()` global error boundary
   - Ensures structured JSON error responses (not HTML crash screens)
   - **Fix mode**: Automatically inserts a comprehensive error handler with 402/500 status codes

5. **Node.js Compatibility Flag**
   - Checks if Node crypto dependencies are used without `nodejs_compat` flag
   - **Fix mode**: Adds `compatibility_flags = ["nodejs_compat"]` to wrangler config

## Usage

### Quick Start

```bash
# Scan for issues (no modifications)
npm run audit

# Scan and automatically fix issues
npm run audit:fix
```

### Direct Execution

```bash
# Dry-run mode (scan only)
npx tsx audit-and-fix-x402.ts --dry-run

# Fix mode (scan and repair)
npx tsx audit-and-fix-x402.ts --fix

# Show help
npx tsx audit-and-fix-x402.ts --help
```

## Execution Modes

### 1. Dry-Run Mode (`--dry-run`)

**Default mode** - Scans the workspace and generates a compliance report without modifying any files.

- Lists all issues with `PASS`, `WARN`, or `FAIL` status
- Generates a Markdown audit report
- Exits with error code 1 if any checks fail
- Safe to run in CI/CD pipelines

**Example Output:**

```
════════════════════════════════════════
  x402 Security Remediation & Fixer Agent
════════════════════════════════════════
  Mode: DRY-RUN
  Time: 2026-05-31T00:57:26.153Z
════════════════════════════════════════

▶ Running: Wrangler Sensitive Variables
  [PASS] No sensitive variables found in [vars] block

▶ Running: Gitignore Configuration
  [PASS] All required entries present in .gitignore

▶ Running: Hono Environment Bindings
  [PASS] No process.env usage found (using c.env pattern)

▶ Running: Hono Error Handler
  [FAIL] Missing Hono error handler (app.onError)
  Should add global error boundary for runtime exceptions

▶ Running: Node.js Compatibility Flag
  [PASS] No Node crypto dependencies detected

════════════════════════════════════════
  AUDIT SUMMARY
════════════════════════════════════════
  Total Checks:  5
  Passed:        4
  Warnings:      0
  Failed:        1
════════════════════════════════════════

📄 Report saved to: audit-report-1780189046160.md
```

### 2. Fix Mode (`--fix`)

**Active remediation mode** - Scans and automatically modifies files to bring the repository into compliance.

- Performs all the same checks as dry-run
- Automatically fixes detected issues
- Shows `[WARN]` for issues that were fixed
- Generates before/after audit report
- Safe to run multiple times (idempotent)

**Example Output:**

```
════════════════════════════════════════
  x402 Security Remediation & Fixer Agent
════════════════════════════════════════
  Mode: FIX
  Time: 2026-05-31T00:57:38.392Z
════════════════════════════════════════

▶ Running: Hono Error Handler
  ✓ Successfully wrote: src/index.ts
  [WARN] Hono error handler was missing
  Added global error boundary with structured JSON responses
  ✓ Fixed automatically

════════════════════════════════════════
  AUDIT SUMMARY
════════════════════════════════════════
  Total Checks:  5
  Passed:        4
  Warnings:      1
  Failed:        0
  Auto-Fixed:    1
════════════════════════════════════════
```

## Audit Reports

The tool generates timestamped Markdown reports in the repository root:

```
audit-report-<timestamp>.md
```

**Report Contents:**

- Execution timestamp and mode
- Summary table (total, passed, warnings, failed, fixed)
- Detailed results for each check
- Status indicators (✅ PASS, ⚠️ WARN, ❌ FAIL)
- Auto-fix indicators (🔧)

**Note:** Audit reports are automatically excluded from git via `.gitignore`.

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Security Audit

on: [push, pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm install
      - run: npm run audit
```

### Pre-commit Hook

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/bash
npm run audit || {
  echo "Security audit failed. Run 'npm run audit:fix' to fix issues."
  exit 1
}
```

## What Gets Fixed

### Example 1: Missing Error Handler

**Before:**

```typescript
const app = new Hono<AppContext>();

app.get("/", (c) => {
	return c.json({ status: "ok" });
});
```

**After (Fix Mode):**

```typescript
const app = new Hono<AppContext>();

// Global error boundary for runtime exceptions
app.onError((err, c) => {
	console.error("Runtime error:", err);

	// Structured error response for x402 compliance
	const status =
		err.message.includes("Unauthorized") || err.message.includes("payment")
			? 402
			: 500;

	return c.json(
		{
			error: true,
			message: err.message || "Internal server error",
			status,
			timestamp: new Date().toISOString(),
		},
		status
	);
});

app.get("/", (c) => {
	return c.json({ status: "ok" });
});
```

### Example 2: Missing nodejs_compat Flag

**Before (`wrangler.jsonc`):**

```jsonc
{
	"name": "my-worker",
	"compatibility_date": "2025-10-08",
}
```

**After (Fix Mode):**

```jsonc
{
	"name": "my-worker",
	"compatibility_date": "2025-10-08",
	"compatibility_flags": ["nodejs_compat"],
}
```

### Example 3: Process.env Usage

**Before:**

```typescript
const apiKey = process.env.API_KEY;
const network = process.env.NETWORK;
```

**After (Fix Mode):**

```typescript
const apiKey = c.env.API_KEY;
const network = c.env.NETWORK;
```

## Technical Architecture

### Stack

- **Runtime**: Node.js with TypeScript
- **Execution**: tsx (TypeScript execution)
- **File I/O**: Node.js `fs/promises`
- **Parsing**: Regex-based for JSONC and TOML
- **Terminal**: ANSI color codes for colorized output

### Check Engine

Each check follows this pattern:

1. **Detection**: Scan files for specific patterns
2. **Validation**: Determine if configuration meets standards
3. **Remediation** (fix mode only): Modify files to fix issues
4. **Reporting**: Log status and details

### Status Codes

- **PASS** ✅: Configuration meets standards
- **WARN** ⚠️: Issue detected and fixed (fix mode) or fixable (dry-run)
- **FAIL** ❌: Issue detected, not fixed (dry-run mode only)

## Best Practices

### When to Use Dry-Run

- Before committing code
- In CI/CD pipelines
- When reviewing repository security posture
- Before running fix mode

### When to Use Fix Mode

- After cloning a repository
- During initial setup
- When audit reports show fixable issues
- As part of automated maintenance

### Safety

✅ **Safe to run multiple times** - The tool is idempotent and won't break working configurations

✅ **Non-destructive** - Only adds code, doesn't remove functionality

✅ **Backup recommended** - Always commit working code before running fix mode

## Troubleshooting

### "No wrangler configuration file found"

**Solution**: Ensure you have either `wrangler.jsonc` or `wrangler.toml` in the repository root.

### "Could not locate Hono app initialization"

**Solution**: The tool looks for `const app = new Hono`. Ensure your Hono app is initialized with this exact pattern in `src/index.ts` or `src/worker.ts`.

### "Error writing file"

**Solution**: Check file permissions. Ensure the script has write access to the repository.

## Contributing

To add new security checks:

1. Create a new check function following the pattern:

   ```typescript
   async function checkMyNewCheck(dryRun: boolean): Promise<CheckResult>;
   ```

2. Add the check to the `checkFunctions` array in `runAudit()`

3. Test in both dry-run and fix modes

4. Update this documentation

## References

- [Cloudflare Workers Best Practices](https://developers.cloudflare.com/workers/best-practices/)
- [Hono Framework Documentation](https://hono.dev/)
- [x402 Protocol Specification](https://x402.org)
- [Wrangler Configuration Reference](https://developers.cloudflare.com/workers/wrangler/configuration/)

## License

This tool is part of the x402-cloudflare-setup repository and follows the same license terms.
