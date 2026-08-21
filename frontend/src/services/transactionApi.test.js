import { beforeEach, expect, test, vi } from 'vitest'

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }))
vi.mock('./api.js', () => ({ apiRequest }))

import {
  createTransferQuote,
  getMyTransactions,
  pollTransactionUntilSettled,
  sendTransaction,
} from './transactionApi.js'

beforeEach(() => apiRequest.mockReset())

test('transaction list calculation normalizes pagination and optional status filters', async () => {
  apiRequest.mockResolvedValue({ transactions: [] })
  await getMyTransactions({ token: 'auth', limit: 10.9, page: 2.8, status: 'pending', view: 'sent' })
  expect(apiRequest).toHaveBeenCalledWith(
    '/api/transactions/my?limit=10&page=2&status=pending&view=sent',
    { token: 'auth' },
  )
})

test('transaction submission forwards the complete wallet transaction state', async () => {
  apiRequest.mockResolvedValue({ transaction: { id: 'tx-1', status: 'pending' } })
  await sendTransaction({
    token: 'auth', receiverWallet: '0xreceiver', amountEth: 1.25,
    verificationCode: '123456', assetSymbol: 'BNB', txHash: '0xhash', quoteId: 'quote-1',
  })
  expect(apiRequest).toHaveBeenCalledWith('/api/transactions/send', expect.objectContaining({
    method: 'POST',
    token: 'auth',
    body: expect.objectContaining({ amountEth: 1.25, txHash: '0xhash', assetSymbol: 'BNB', quoteId: 'quote-1' }),
  }))
})

test('quote creation forwards both currencies and the source amount', async () => {
  apiRequest.mockResolvedValue({ quote: { quoteId: 'quote-1' } })
  await createTransferQuote({ token: 'auth', sourceAmount: 2, sourceCurrency: 'BNB', destinationCurrency: 'USDT' })
  expect(apiRequest).toHaveBeenCalledWith('/api/transactions/quote', {
    method: 'POST', token: 'auth',
    body: { sourceAmount: 2, sourceCurrency: 'BNB', destinationCurrency: 'USDT' },
  })
})

test.each(['success', 'failed', 'cancelled'])('polling stops immediately on terminal %s status', async (status) => {
  const transaction = { id: 'tx-1', status }
  const onUpdate = vi.fn()
  apiRequest.mockResolvedValue({ transaction })
  await expect(pollTransactionUntilSettled({
    token: 'auth', id: 'tx-1', initialDelayMs: 0, intervalMs: 0, onUpdate,
  })).resolves.toEqual(transaction)
  expect(onUpdate).toHaveBeenCalledWith(transaction)
  expect(apiRequest).toHaveBeenCalledTimes(1)
})
