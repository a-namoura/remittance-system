import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import SystemNotifications from './SystemNotifications.jsx'
import { publishSystemNotification } from '../services/systemNotifications.js'

afterEach(() => vi.useRealTimers())

test('notification publishes with accessible severity and can be dismissed', async () => {
  const user = userEvent.setup()
  render(<SystemNotifications />)
  act(() => publishSystemNotification('Transfer failed', { variant: 'error' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Transfer failed')
  await user.click(screen.getByRole('button', { name: /dismiss notification/i }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('notification automatically clears after its duration', () => {
  vi.useFakeTimers()
  render(<SystemNotifications />)
  act(() => publishSystemNotification('Transfer submitted', { variant: 'success', durationMs: 500 }))
  expect(screen.getByRole('status')).toHaveTextContent('Transfer submitted')
  act(() => vi.advanceTimersByTime(500))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
