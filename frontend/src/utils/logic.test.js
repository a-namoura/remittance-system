import { expect, test } from 'vitest'
import { isAllowedAmountValue } from './amount.js'
import { getEmailIdentifierError, isValidEmail } from './emailValidation.js'
import { getPasswordPolicyError, getPasswordStrength, isPasswordPolicySatisfied } from './passwordPolicy.js'
import { displayCurrency, LEGACY_NATIVE_CURRENCY, nativeCurrencyFrom } from './currency.js'

test('amount precision accepts incomplete valid drafts and rejects invalid calculations', () => {
  expect(isAllowedAmountValue('')).toBe(true)
  expect(isAllowedAmountValue('1.')).toBe(true)
  expect(isAllowedAmountValue('1.2345')).toBe(true)
  expect(isAllowedAmountValue('1.23456')).toBe(false)
  expect(isAllowedAmountValue('-1')).toBe(false)
})

test('email and password validation reports actionable state', () => {
  expect(isValidEmail(' person@example.com ')).toBe(true)
  expect(getEmailIdentifierError('person@')).toBe('Please enter a valid email address.')
  expect(isPasswordPolicySatisfied('Strong1!')).toBe(true)
  expect(getPasswordPolicyError('weak')).toMatch(/uppercase.*number.*special/i)
  expect(getPasswordStrength('Strong1!')).toMatchObject({ score: 4, maxScore: 4, label: 'Strong' })
})

test('currency calculation/display logic normalizes legacy and numeric values', () => {
  expect(displayCurrency(LEGACY_NATIVE_CURRENCY, 'BNB')).toBe('BNB')
  expect(nativeCurrencyFrom({ nativeCurrency: ' bnb ' })).toBe('BNB')
  expect(nativeCurrencyFrom({}, LEGACY_NATIVE_CURRENCY.toLowerCase())).toBe(LEGACY_NATIVE_CURRENCY)
})
