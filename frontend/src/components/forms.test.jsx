import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, test } from 'vitest'
import AmountInput from './AmountInput.jsx'
import FormSubmitButton from './FormSubmitButton.jsx'
import PasswordStrengthIndicator from './PasswordStrengthIndicator.jsx'
import WalletApprovalStatus from './WalletApprovalStatus.jsx'

function AmountHarness() {
  const [value, setValue] = useState('')
  return <AmountInput aria-label="Transfer amount" value={value} onValueChange={setValue} />
}

test('amount form normalizes commas and blocks excess precision and non-numeric input', async () => {
  const user = userEvent.setup()
  render(<AmountHarness />)
  const input = screen.getByRole('textbox', { name: /transfer amount/i })
  await user.type(input, '12,3456')
  expect(input).toHaveValue('12.3456')
  await user.type(input, '7x')
  expect(input).toHaveValue('12.3456')
})

test('submit button reflects busy, explicit disabled, and prerequisite state', () => {
  const { rerender } = render(<FormSubmitButton prerequisites={[true, false]}>Send</FormSubmitButton>)
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  rerender(<FormSubmitButton prerequisites={[true, true]}>Send</FormSubmitButton>)
  expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
  rerender(<FormSubmitButton busy prerequisites={[true, true]}>Send</FormSubmitButton>)
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
})

test('password form exposes strength and unmet validation requirements', () => {
  const { rerender } = render(<PasswordStrengthIndicator password="weak" />)
  expect(screen.getByText('Very weak')).toBeInTheDocument()
  expect(screen.getByText('At least one uppercase letter').parentElement).not.toHaveClass('text-green-800')
  rerender(<PasswordStrengthIndicator password="Strong1!" />)
  expect(screen.getByText('Strong')).toBeInTheDocument()
  expect(screen.getAllByText('OK')).toHaveLength(4)
})

test('wallet approval status only appears while wallet confirmation is required', () => {
  const { rerender } = render(<WalletApprovalStatus visible={false} />)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  rerender(<WalletApprovalStatus visible providerName="MetaMask" />)
  expect(screen.getByRole('status')).toHaveTextContent('Check your MetaMask')
  expect(screen.getByRole('status')).toHaveTextContent('Approve the transaction')
})
