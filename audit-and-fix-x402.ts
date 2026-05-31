#!/usr/bin/env tsx
/**
 * x402 Cloudflare Worker - Security Remediation & Fixer Agent
 *
 * Principal Security Engineer & Web3 DevOps Automation Tool
 *
 * Execution Modes:
 *   --dry-run: Scan and generate compliance report (no modifications)
 *   --fix:     Actively modify files to meet security standards
 *
 * Usage:
 *   tsx audit-and-fix-x402.ts --dry-run
 *   tsx audit-and-fix-x402.ts --fix
 */

import * as fs from "fs/promises";
import * as path from "path";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

type CheckStatus = "PASS" | "WARN" | "FAIL";

interface CheckResult {
	status: CheckStatus;
	message: string;
	details?: string;
	fixed?: boolean;
}

interface AuditReport {
	timestamp: string;
	mode: "dry-run" | "fix";
	checks: {
		name: string;
		result: CheckResult;
	}[];
	summary: {
		total: number;
		passed: number;
		warned: number;
		failed: number;
		fixed: number;
	};
}

// ============================================================================
// TERMINAL COLORS
// ============================================================================

const colors = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	dim: "\x1b[2m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	cyan: "\x1b[36m",
	white: "\x1b[37m",
};

function colorize(text: string, color: keyof typeof colors): string {
	return `${colors[color]}${text}${colors.reset}`;
}

function statusColor(status: CheckStatus): keyof typeof colors {
	switch (status) {
		case "PASS":
			return "green";
		case "WARN":
			return "yellow";
		case "FAIL":
			return "red";
	}
}

// ============================================================================
// FILE SYSTEM UTILITIES
// ============================================================================

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function readFile(filePath: string): Promise<string | null> {
	try {
		return await fs.readFile(filePath, "utf-8");
	} catch (error) {
		console.error(colorize(`Error reading ${filePath}: ${error}`, "red"));
		return null;
	}
}

async function writeFile(
	filePath: string,
	content: string,
	dryRun: boolean
): Promise<boolean> {
	if (dryRun) {
		console.log(colorize(`  [DRY-RUN] Would write to: ${filePath}`, "dim"));
		return true;
	}

	try {
		await fs.writeFile(filePath, content, "utf-8");
		console.log(colorize(`  ✓ Successfully wrote: ${filePath}`, "green"));
		return true;
	} catch (error) {
		console.error(colorize(`  ✗ Error writing ${filePath}: ${error}`, "red"));
		return false;
	}
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const REPO_ROOT = process.cwd();
const WRANGLER_CONFIG_PATH = path.join(REPO_ROOT, "wrangler.jsonc");
const WRANGLER_TOML_PATH = path.join(REPO_ROOT, "wrangler.toml");
const GITIGNORE_PATH = path.join(REPO_ROOT, ".gitignore");
const PACKAGE_JSON_PATH = path.join(REPO_ROOT, "package.json");

const SENSITIVE_VAR_PATTERNS = [
	/PRIVATE_KEY/i,
	/FACILITATOR_URL/i,
	/WALLET_ADDRESS/i,
	/SECRET/i,
	/API_KEY/i,
	/PASSWORD/i,
	/TOKEN/i,
];

const REQUIRED_GITIGNORE_ENTRIES = [".dev.vars", ".env", "node_modules"];

// ============================================================================
// CHECK 1: WRANGLER CONFIGURATION - SENSITIVE VARIABLES
// ============================================================================

async function checkWranglerSensitiveVars(
	dryRun: boolean
): Promise<CheckResult> {
	// Check both wrangler.jsonc and wrangler.toml
	let configPath = WRANGLER_CONFIG_PATH;
	let content = await readFile(configPath);

	if (!content) {
		configPath = WRANGLER_TOML_PATH;
		content = await readFile(configPath);
	}

	if (!content) {
		return {
			status: "WARN",
			message: "No wrangler configuration file found",
			details: "Expected wrangler.jsonc or wrangler.toml",
		};
	}

	const isJsonc = configPath.endsWith(".jsonc");
	const foundSensitiveVars: string[] = [];

	if (isJsonc) {
		// Parse JSONC (with comments) - simple regex approach
		const varsBlockMatch = content.match(/"vars"\s*:\s*\{([^}]+)\}/s);
		if (varsBlockMatch) {
			const varsContent = varsBlockMatch[1];
			for (const pattern of SENSITIVE_VAR_PATTERNS) {
				const matches = varsContent.matchAll(
					new RegExp(`"([^"]*${pattern.source}[^"]*)"\s*:`, "gi")
				);
				for (const match of matches) {
					if (match[1]) {
						foundSensitiveVars.push(match[1]);
					}
				}
			}
		}
	} else {
		// Parse TOML [vars] section
		const varsMatch = content.match(/\[vars\]([\s\S]*?)(?=\n\[|$)/);
		if (varsMatch) {
			const varsSection = varsMatch[1];
			for (const pattern of SENSITIVE_VAR_PATTERNS) {
				const matches = varsSection.matchAll(
					new RegExp(`^\\s*([^#=\\s]*${pattern.source}[^#=\\s]*)\\s*=`, "gim")
				);
				for (const match of matches) {
					if (match[1]) {
						foundSensitiveVars.push(match[1]);
					}
				}
			}
		}
	}

	if (foundSensitiveVars.length === 0) {
		return {
			status: "PASS",
			message: "No sensitive variables found in [vars] block",
		};
	}

	// If we're in fix mode, attempt to remove sensitive vars and add warnings
	if (!dryRun) {
		const warnings = foundSensitiveVars
			.map(
				(varName) =>
					`# WARNING: ${varName} should be in .dev.vars or set via 'wrangler secret put ${varName}'`
			)
			.join("\n");

		if (isJsonc) {
			// For JSONC, just add comment warning above vars block
			const updatedContent = content.replace(
				/"vars"\s*:\s*\{/,
				`// ${warnings.replace(/\n/g, "\n\t// ")}\n\t"vars": {`
			);
			await writeFile(configPath, updatedContent, dryRun);
		} else {
			// For TOML, add warnings above [vars]
			const updatedContent = content.replace(/\[vars\]/, `${warnings}\n[vars]`);
			await writeFile(configPath, updatedContent, dryRun);
		}

		return {
			status: "WARN",
			message: `Found ${foundSensitiveVars.length} sensitive variable(s) in [vars] block`,
			details: `Variables: ${foundSensitiveVars.join(", ")}\nAdded warnings to move them to .dev.vars or Cloudflare secrets`,
			fixed: true,
		};
	}

	return {
		status: "FAIL",
		message: `Found ${foundSensitiveVars.length} sensitive variable(s) in [vars] block`,
		details: `Variables: ${foundSensitiveVars.join(", ")}\nThese should be in .dev.vars or set via 'wrangler secret put'`,
	};
}

// ============================================================================
// CHECK 2: GITIGNORE VALIDATION
// ============================================================================

async function checkGitignore(dryRun: boolean): Promise<CheckResult> {
	const exists = await fileExists(GITIGNORE_PATH);

	if (!exists) {
		if (!dryRun) {
			const defaultGitignore = `# Dependencies
node_modules/

# Environment variables
.dev.vars
.env
.env.production

# Build output
dist/
.wrangler/

# Logs
*.log

# OS
.DS_Store
`;
			await writeFile(GITIGNORE_PATH, defaultGitignore, dryRun);
			return {
				status: "WARN",
				message: ".gitignore was missing",
				details: "Created new .gitignore with standard entries",
				fixed: true,
			};
		}

		return {
			status: "FAIL",
			message: ".gitignore file is missing",
			details: "Should create .gitignore with .dev.vars, .env, node_modules",
		};
	}

	const content = await readFile(GITIGNORE_PATH);
	if (!content) {
		return {
			status: "FAIL",
			message: "Failed to read .gitignore",
		};
	}

	const missingEntries = REQUIRED_GITIGNORE_ENTRIES.filter(
		(entry) => !content.includes(entry)
	);

	if (missingEntries.length === 0) {
		return {
			status: "PASS",
			message: "All required entries present in .gitignore",
		};
	}

	if (!dryRun) {
		const updatedContent = content + "\n" + missingEntries.join("\n") + "\n";
		await writeFile(GITIGNORE_PATH, updatedContent, dryRun);
		return {
			status: "WARN",
			message: `Missing ${missingEntries.length} required .gitignore entries`,
			details: `Added: ${missingEntries.join(", ")}`,
			fixed: true,
		};
	}

	return {
		status: "FAIL",
		message: `Missing ${missingEntries.length} required .gitignore entries`,
		details: `Missing: ${missingEntries.join(", ")}`,
	};
}

// ============================================================================
// CHECK 3: HONO ENVIRONMENT BINDINGS
// ============================================================================

async function checkHonoEnvironmentBindings(
	dryRun: boolean
): Promise<CheckResult> {
	const srcFiles = ["src/index.ts", "src/worker.ts"];
	let entrypoint: string | null = null;
	let content: string | null = null;

	for (const file of srcFiles) {
		const filePath = path.join(REPO_ROOT, file);
		const fileContent = await readFile(filePath);
		if (fileContent) {
			entrypoint = filePath;
			content = fileContent;
			break;
		}
	}

	if (!entrypoint || !content) {
		return {
			status: "WARN",
			message: "No Hono entrypoint found",
			details: "Expected src/index.ts or src/worker.ts",
		};
	}

	// Check for process.env usage (Node.js pattern)
	const processEnvMatches = content.match(/process\.env\.([A-Z_]+)/g);

	if (!processEnvMatches || processEnvMatches.length === 0) {
		return {
			status: "PASS",
			message: "No process.env usage found (using c.env pattern)",
		};
	}

	if (!dryRun) {
		let updatedContent = content;
		const replacements: string[] = [];

		for (const match of processEnvMatches) {
			const varName = match.replace("process.env.", "");
			updatedContent = updatedContent.replace(
				new RegExp(`process\\.env\\.${varName}`, "g"),
				`c.env.${varName}`
			);
			replacements.push(`process.env.${varName} → c.env.${varName}`);
		}

		await writeFile(entrypoint, updatedContent, dryRun);
		return {
			status: "WARN",
			message: "Found Node.js process.env usage in Hono app",
			details: `Replaced:\n  ${replacements.join("\n  ")}`,
			fixed: true,
		};
	}

	return {
		status: "FAIL",
		message: "Found Node.js process.env usage in Hono app",
		details: `Found: ${processEnvMatches.join(", ")}\nShould use c.env instead for Cloudflare Workers`,
	};
}

// ============================================================================
// CHECK 4: HONO ERROR HANDLER
// ============================================================================

async function checkHonoErrorHandler(dryRun: boolean): Promise<CheckResult> {
	const srcFiles = ["src/index.ts", "src/worker.ts"];
	let entrypoint: string | null = null;
	let content: string | null = null;

	for (const file of srcFiles) {
		const filePath = path.join(REPO_ROOT, file);
		const fileContent = await readFile(filePath);
		if (fileContent) {
			entrypoint = filePath;
			content = fileContent;
			break;
		}
	}

	if (!entrypoint || !content) {
		return {
			status: "WARN",
			message: "No Hono entrypoint found",
		};
	}

	// Check for app.onError handler
	const hasErrorHandler = /app\.onError\s*\(/i.test(content);

	if (hasErrorHandler) {
		return {
			status: "PASS",
			message: "Hono error handler is present",
		};
	}

	if (!dryRun) {
		// Find the position to insert error handler (after app initialization)
		const appInitMatch = content.match(/(const app = new Hono[^;]*;)/);

		if (!appInitMatch) {
			return {
				status: "FAIL",
				message: "Could not locate Hono app initialization",
				details: "Unable to insert error handler automatically",
			};
		}

		const errorHandlerCode = `

// Global error boundary for runtime exceptions
app.onError((err, c) => {
	console.error("Runtime error:", err);

	// Structured error response for x402 compliance
	const status = err.message.includes("Unauthorized") || err.message.includes("payment")
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
`;

		const updatedContent = content.replace(
			appInitMatch[0],
			appInitMatch[0] + errorHandlerCode
		);

		await writeFile(entrypoint, updatedContent, dryRun);
		return {
			status: "WARN",
			message: "Hono error handler was missing",
			details: "Added global error boundary with structured JSON responses",
			fixed: true,
		};
	}

	return {
		status: "FAIL",
		message: "Missing Hono error handler (app.onError)",
		details: "Should add global error boundary for runtime exceptions",
	};
}

// ============================================================================
// CHECK 5: NODEJS_COMPAT FLAG
// ============================================================================

async function checkNodejsCompat(dryRun: boolean): Promise<CheckResult> {
	// Check package.json for Node crypto dependencies
	const packageContent = await readFile(PACKAGE_JSON_PATH);
	if (!packageContent) {
		return {
			status: "WARN",
			message: "Could not read package.json",
		};
	}

	const packageJson = JSON.parse(packageContent);
	const allDeps = {
		...packageJson.dependencies,
		...packageJson.devDependencies,
	};

	// Check for Node-dependent crypto libraries
	const nodeCryptoLibs = ["crypto", "node:crypto", "buffer", "stream"];
	const hasNodeCrypto = nodeCryptoLibs.some((lib) => lib in allDeps);

	if (!hasNodeCrypto) {
		return {
			status: "PASS",
			message: "No Node crypto dependencies detected",
		};
	}

	// Check wrangler config for nodejs_compat flag
	let configPath = WRANGLER_CONFIG_PATH;
	let content = await readFile(configPath);

	if (!content) {
		configPath = WRANGLER_TOML_PATH;
		content = await readFile(configPath);
	}

	if (!content) {
		return {
			status: "WARN",
			message: "No wrangler configuration file found",
		};
	}

	const hasCompatFlag = /nodejs_compat/.test(content);

	if (hasCompatFlag) {
		return {
			status: "PASS",
			message: "nodejs_compat flag is present",
		};
	}

	if (!dryRun) {
		const isJsonc = configPath.endsWith(".jsonc");

		if (isJsonc) {
			// Add compatibility_flags to JSONC
			const hasCompatSection = /"compatibility_flags"\s*:/i.test(content);

			if (hasCompatSection) {
				// Add to existing array
				const updatedContent = content.replace(
					/"compatibility_flags"\s*:\s*\[/i,
					'"compatibility_flags": ["nodejs_compat", '
				);
				await writeFile(configPath, updatedContent, dryRun);
			} else {
				// Create new compatibility_flags section after compatibility_date
				const updatedContent = content.replace(
					/"compatibility_date"\s*:\s*"[^"]+"\s*,/i,
					(match) => `${match}\n\t"compatibility_flags": ["nodejs_compat"],`
				);
				await writeFile(configPath, updatedContent, dryRun);
			}
		} else {
			// Add to TOML
			const hasCompatSection = /^compatibility_flags\s*=/im.test(content);

			if (hasCompatSection) {
				const updatedContent = content.replace(
					/^compatibility_flags\s*=\s*\[/im,
					'compatibility_flags = ["nodejs_compat", '
				);
				await writeFile(configPath, updatedContent, dryRun);
			} else {
				const updatedContent = content.replace(
					/^compatibility_date\s*=\s*.+$/im,
					(match) => `${match}\ncompatibility_flags = ["nodejs_compat"]`
				);
				await writeFile(configPath, updatedContent, dryRun);
			}
		}

		return {
			status: "WARN",
			message: "nodejs_compat flag was missing",
			details:
				"Added compatibility_flags = ['nodejs_compat'] to wrangler config",
			fixed: true,
		};
	}

	return {
		status: "FAIL",
		message: "Missing nodejs_compat flag with Node crypto dependencies",
		details: "Add compatibility_flags = ['nodejs_compat'] to wrangler config",
	};
}

// ============================================================================
// MAIN AUDIT ENGINE
// ============================================================================

async function runAudit(mode: "dry-run" | "fix"): Promise<AuditReport> {
	const dryRun = mode === "dry-run";

	console.log(colorize("\n════════════════════════════════════════", "cyan"));
	console.log(colorize("  x402 Security Remediation & Fixer Agent", "bright"));
	console.log(colorize("════════════════════════════════════════", "cyan"));
	console.log(
		colorize(`  Mode: ${mode.toUpperCase()}`, dryRun ? "yellow" : "green")
	);
	console.log(colorize(`  Time: ${new Date().toISOString()}`, "dim"));
	console.log(colorize("════════════════════════════════════════\n", "cyan"));

	const checks: AuditReport["checks"] = [];

	// Run all checks
	const checkFunctions = [
		{ name: "Wrangler Sensitive Variables", fn: checkWranglerSensitiveVars },
		{ name: "Gitignore Configuration", fn: checkGitignore },
		{ name: "Hono Environment Bindings", fn: checkHonoEnvironmentBindings },
		{ name: "Hono Error Handler", fn: checkHonoErrorHandler },
		{ name: "Node.js Compatibility Flag", fn: checkNodejsCompat },
	];

	for (const check of checkFunctions) {
		console.log(colorize(`\n▶ Running: ${check.name}`, "blue"));
		const result = await check.fn(dryRun);
		checks.push({ name: check.name, result });

		const statusText = colorize(
			`  [${result.status}]`,
			statusColor(result.status)
		);
		console.log(`${statusText} ${result.message}`);

		if (result.details) {
			console.log(colorize(`  ${result.details}`, "dim"));
		}

		if (result.fixed) {
			console.log(colorize("  ✓ Fixed automatically", "green"));
		}
	}

	// Generate summary
	const summary = {
		total: checks.length,
		passed: checks.filter((c) => c.result.status === "PASS").length,
		warned: checks.filter((c) => c.result.status === "WARN").length,
		failed: checks.filter((c) => c.result.status === "FAIL").length,
		fixed: checks.filter((c) => c.result.fixed).length,
	};

	const report: AuditReport = {
		timestamp: new Date().toISOString(),
		mode,
		checks,
		summary,
	};

	// Print summary
	console.log(colorize("\n════════════════════════════════════════", "cyan"));
	console.log(colorize("  AUDIT SUMMARY", "bright"));
	console.log(colorize("════════════════════════════════════════", "cyan"));
	console.log(colorize(`  Total Checks:  ${summary.total}`, "white"));
	console.log(colorize(`  Passed:        ${summary.passed}`, "green"));
	console.log(colorize(`  Warnings:      ${summary.warned}`, "yellow"));
	console.log(colorize(`  Failed:        ${summary.failed}`, "red"));
	if (summary.fixed > 0) {
		console.log(colorize(`  Auto-Fixed:    ${summary.fixed}`, "green"));
	}
	console.log(colorize("════════════════════════════════════════\n", "cyan"));

	// Write report to file
	const reportPath = path.join(REPO_ROOT, `audit-report-${Date.now()}.md`);
	const reportMarkdown = generateMarkdownReport(report);
	await writeFile(reportPath, reportMarkdown, false);
	console.log(
		colorize(`📄 Report saved to: ${path.basename(reportPath)}`, "blue")
	);

	return report;
}

// ============================================================================
// MARKDOWN REPORT GENERATION
// ============================================================================

function generateMarkdownReport(report: AuditReport): string {
	const { timestamp, mode, checks, summary } = report;

	let md = `# x402 Security Audit Report

**Timestamp:** ${timestamp}
**Mode:** ${mode.toUpperCase()}

## Summary

| Metric | Count |
|--------|-------|
| Total Checks | ${summary.total} |
| ✅ Passed | ${summary.passed} |
| ⚠️ Warnings | ${summary.warned} |
| ❌ Failed | ${summary.failed} |
| 🔧 Auto-Fixed | ${summary.fixed} |

## Detailed Results

`;

	for (const check of checks) {
		const { name, result } = check;
		const emoji =
			result.status === "PASS" ? "✅" : result.status === "WARN" ? "⚠️" : "❌";

		md += `### ${emoji} ${name}\n\n`;
		md += `**Status:** ${result.status}  \n`;
		md += `**Message:** ${result.message}\n\n`;

		if (result.details) {
			md += `**Details:**\n\`\`\`\n${result.details}\n\`\`\`\n\n`;
		}

		if (result.fixed) {
			md += `✅ **Auto-Fixed**\n\n`;
		}

		md += `---\n\n`;
	}

	return md;
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

async function main() {
	const args = process.argv.slice(2);
	const mode = args.includes("--fix") ? "fix" : "dry-run";

	if (args.includes("--help") || args.includes("-h")) {
		console.log(`
x402 Security Remediation & Fixer Agent

Usage:
  tsx audit-and-fix-x402.ts [--dry-run | --fix]

Options:
  --dry-run    Scan and report issues without making changes (default)
  --fix        Actively modify files to fix detected issues
  --help, -h   Show this help message

Examples:
  tsx audit-and-fix-x402.ts --dry-run
  tsx audit-and-fix-x402.ts --fix
`);
		process.exit(0);
	}

	try {
		const report = await runAudit(mode);

		// Exit with error code if there are failures (only in dry-run mode)
		if (mode === "dry-run" && report.summary.failed > 0) {
			process.exit(1);
		}
	} catch (error) {
		console.error(colorize(`\n❌ Fatal error: ${error}`, "red"));
		process.exit(1);
	}
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}

export { runAudit, type AuditReport, type CheckResult };
