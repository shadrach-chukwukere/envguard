/**
 * Error system for EnvGuard.
 *
 * Provides stable error codes, a factory for structured validation issues,
 * and formatting utilities. All messages are designed to be useful without
 * leaking secret values.
 */

import { EnvGuardError } from './types'
import type { ValidationIssue } from './types'

/**
 * Stable error codes. These never change between minor releases so
 * consumers can handle specific failure modes programmatically.
 */
export const ErrorCode = {
  /** A required variable was not provided (and has no default). */
  MISSING: 'ERR_ENV_MISSING',
  /** A variable is present but not declared in the schema (strict mode). */
  UNEXPECTED: 'ERR_ENV_UNEXPECTED',
  /** The value could not be parsed as the expected type. */
  INVALID_TYPE: 'ERR_ENV_INVALID_TYPE',
  /** The value is below the allowed minimum. */
  BELOW_MINIMUM: 'ERR_ENV_BELOW_MINIMUM',
  /** The value is above the allowed maximum. */
  ABOVE_MAXIMUM: 'ERR_ENV_ABOVE_MAXIMUM',
  /** A string is shorter than the allowed minimum length. */
  TOO_SHORT: 'ERR_ENV_TOO_SHORT',
  /** A string is longer than the allowed maximum length. */
  TOO_LONG: 'ERR_ENV_TOO_LONG',
  /** The value does not match the required pattern. */
  PATTERN_MISMATCH: 'ERR_ENV_PATTERN_MISMATCH',
  /** The value is not one of the allowed values. */
  INVALID_ENUM: 'ERR_ENV_INVALID_ENUM',
  /** The value is not valid JSON. */
  INVALID_JSON: 'ERR_ENV_INVALID_JSON',
  /** The value is not a valid URL. */
  INVALID_URL: 'ERR_ENV_INVALID_URL',
  /** The value is not a valid port. */
  INVALID_PORT: 'ERR_ENV_INVALID_PORT',
  /** A custom validator rejected the value. */
  CUSTOM_VALIDATION: 'ERR_ENV_CUSTOM_VALIDATION',
  /** A cross-variable rule failed. */
  CROSS_VARIABLE: 'ERR_ENV_CROSS_VARIABLE',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

/**
 * Build a `ValidationIssue` with the variable name pre-filled.
 */
export function issue(
  variable: string,
  code: ErrorCode,
  message: string,
  options?: { expected?: string; received?: string },
): ValidationIssue {
  return {
    variable,
    code,
    message,
    ...(options?.expected !== undefined ? { expected: options.expected } : {}),
    ...(options?.received !== undefined ? { received: options.received } : {}),
  }
}

/**
 * Format validation issues into a human-readable string.
 * Secret values are never included.
 */
export function formatIssues(issues: readonly ValidationIssue[]): string {
  const lines = issues.map((i) => {
    const parts = [`- ${i.variable}: ${i.message} (code: ${i.code})`]
    if (i.expected) parts.push(`expected: ${i.expected}`)
    if (i.received) parts.push(`received: ${i.received}`)
    return parts.join(' | ')
  })
  return lines.join('\n')
}

/**
 * Build the `EnvGuardError` thrown by `validateEnv`.
 */
export function createValidationError(issues: ValidationIssue[]): EnvGuardError {
  const message = `EnvGuard: validation failed for ${issues.length} variable(s)\n${formatIssues(issues)}`
  return new EnvGuardError(message, issues)
}
