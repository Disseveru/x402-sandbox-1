---
name: shadow-state-sandbox
description: A secure simulation environment for AI agents to dry-run code or transactions before execution. Use this to prevent errors and verify safety.
pricing: 0.02 USDC per simulation
network: Base (Layer 2)
---

# Shadow State Sandbox Skill

## When to use

Use this skill when an agent needs to verify if a JSON payload, a script, or a blockchain transaction will succeed without actually committing resources or spending real gas.

## How to use

1. **Request Payment:** Send a GET request to the endpoint to receive the payment address and invoice.
2. **Execute Payment:** Send 0.02 USDC on the Base network.
3. **Submit Simulation:** POST the JSON payload to `/api/simulate` with the header `x-402-tx-hash` containing your transaction proof.

## Expected Output

The sandbox will return a `simulation_status` and `dry_run_logs` showing exactly what would have happened in a live environment.
