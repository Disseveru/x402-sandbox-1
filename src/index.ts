import { Hono } from 'hono'
import { empireRouter } from './empire'

// Clean main worker for x402-sandbox-1
// Includes: Empire services + original sandbox logic + SKILL.md for agentic.market discovery
const app = new Hono<{ Bindings: { XAI_API_KEY?: string; PAYMENT_ADDRESS?: string; SKILL_MD_CONTENT?: string } }>()

// Mount the full x402Empire suite
app.route('/empire', empireRouter)

// === Original Sandbox + Bazaar Discovery Support ===

// 1. SKILL.md for automatic discovery on agentic.market
app.get('/SKILL.md', (c) => {
  const content = c.env.SKILL_MD_CONTENT || '# x402Empire Sandbox\n\nHigh-demand niche x402 services ready for agents.'
  return new Response(content, {
    headers: { 'Content-Type': 'text/markdown' }
  })
})

// 2. Basic x402-style payment check (simple version)
app.use('/api/*', async (c, next) => {
  const paymentHash = c.req.header('payment-signature')
  if (!paymentHash && c.req.path !== '/api/simulate') {
    return c.json({
      error: 'Payment Required',
      amount: '0.001',
      asset: 'USDC',
      network: 'base'
    }, 402)
  }
  await next()
})

// 3. Original simulate endpoint
app.post('/api/simulate', async (c) => {
  try {
    const data = await c.req.json()
    return c.json({
      status: 'success',
      result: 'Simulation passed',
      logs: ['Analyzed payload', 'State change: none', 'Risk: Low'],
      received_payload: data
    })
  } catch (e) {
    return c.json({ error: 'Invalid JSON payload' }, 400)
  }
})

// Health check
app.get('/', (c) => {
  const hasXaiKey = !!c.env.XAI_API_KEY
  return c.json({
    status: 'ok',
    message: 'x402Empire Sandbox is live',
    empire_services: 4,
    xai_key_detected: hasXaiKey,
    routes: {
      empire: '/empire/*',
      skill: '/SKILL.md',
      simulate: '/api/simulate'
    },
    ready_for_agentic_market: true
  })
})

// Config endpoint (no secrets exposed)
app.get('/config', (c) => {
  return c.json({
    xai_key_present: !!c.env.XAI_API_KEY,
    payment_configured: !!c.env.PAYMENT_ADDRESS
  })
})

export default app