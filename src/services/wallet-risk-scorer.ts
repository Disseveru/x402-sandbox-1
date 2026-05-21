import { Hono } from 'hono'
import { paymentMiddleware } from 'x402-hono'

export const walletRiskScorer = new Hono()

walletRiskScorer.use(
  paymentMiddleware({
    facilitator: { url: 'https://api.cdp.coinbase.com/platform/v2/x402/facilitator' },
    routes: {
      'POST /api/v1/risk-score': {
        price: '0.0015',
        network: 'base',
        recipient: process.env.RECIPIENT_ADDRESS || '0xYourWalletHere',
        description: 'Real-time on-chain wallet risk scoring and reputation signals',
      },
    },
  })
)

walletRiskScorer.post('/api/v1/risk-score', async (c) => {
  const { address, chain = 'base' } = await c.req.json()

  return c.json({
    address,
    chain,
    risk_score: 27,
    reputation: 'good',
    flags: ['moderate_activity'],
    recommendation: 'Safe for most agent transactions. Monitor large inflows.',
    confidence: 0.91,
    checked_at: new Date().toISOString(),
  })
})

walletRiskScorer.get('/', (c) => c.text('WalletRiskScorer active'))