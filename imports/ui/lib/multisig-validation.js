import { checkWeightsAndThreshold as checkWalletWeightsAndThreshold } from '@theqrl/wallet-helpers'

export default function checkWeightsAndThreshold(weights, threshold) {
  if (!Number.isSafeInteger(threshold) || threshold < 1) {
    return { result: false, error: 'The threshold must be at least 1.' }
  }
  if (!Array.isArray(weights) || weights.length === 0 || !weights.every(
    (weight) => Number.isSafeInteger(weight) && weight >= 1
  )) {
    return { result: false, error: 'Each signatory weight must be at least 1.' }
  }
  return checkWalletWeightsAndThreshold(weights, threshold)
}
