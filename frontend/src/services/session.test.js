import { beforeEach, expect, test } from 'vitest'
import {
  clearAuthToken,
  clearWalletState,
  getAuthToken,
  readWalletState,
  setAuthToken,
  writeWalletState,
} from './session.js'

beforeEach(() => localStorage.clear())

test('wallet state is isolated per user and can be cleared', () => {
  writeWalletState('user-1', ' 0xabc ')
  expect(readWalletState('user-1')).toEqual({ linked: true, address: '0xabc' })
  expect(readWalletState('user-2')).toEqual({ linked: false, address: '' })
  clearWalletState('user-1')
  expect(readWalletState('user-1')).toEqual({ linked: false, address: '' })
})

test('conditional token clearing cannot remove a newer session', () => {
  setAuthToken('new-token')
  expect(clearAuthToken('old-token')).toBe(false)
  expect(getAuthToken()).toBe('new-token')
  expect(clearAuthToken('new-token')).toBe(true)
  expect(getAuthToken()).toBeNull()
})
