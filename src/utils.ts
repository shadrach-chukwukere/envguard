/**
 * Small utility helpers used by the validation engine.
 */

import type { ValidationIssue } from './types'

/**
 * Recursively freeze plain objects and arrays so validated configuration
 * cannot be accidentally modified. Non-plain values (URL, Date, primitives)
 * are left as-is. Already-frozen objects are skipped.
 */
export function deepFreeze(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (Object.isFrozen(value)) {
    return value
  }

  if (Array.isArray(value)) {
    Object.freeze(value)
    for (const item of value) {
      deepFreeze(item)
    }
    return value
  }

  // Only freeze plain objects; skip class instances (URL, etc.) to avoid
  // altering host objects.
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) {
    return value
  }

  Object.freeze(value)
  for (const key of Object.keys(value)) {
    deepFreeze((value as Record<string, unknown>)[key])
  }
  return value
}

/**
 * Redact a value for safe display in errors/logs. Returns '[redacted]' for
 * sensitive values, the value itself otherwise (callers should pass types,
 * not secret strings).
 */
export function redact<T>(value: T, sensitive: boolean): T {
  return sensitive ? ('[redacted]' as unknown as T) : value
}

/**
 * Determine the safe received-type description for a field, masking secrets.
 * Returns `undefined` when no received info should be disclosed.
 */
export function receivedType(value: unknown, sensitive: boolean): string | undefined {
  if (sensitive) {
    return undefined
  }
  if (value === undefined) {
    return 'undefined'
  }
  if (value === null) {
    return 'null'
  }
  return typeof value
}

/**
 * Validate that a value is a plain object (not an array, null, or class
 * instance), guarding against prototype pollution via unexpected keys.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Normalize an environment variable value: empty strings are treated as
 * unset so defaults/optional semantics apply consistently.
 */
export function normalizeEnvValue(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value !== 'string') {
    return String(value)
  }
  return value === '' ? undefined : value
}

/**
 * Extract issue codes from an EnvGuardError for programmatic handling.
 */
export function errorCodes(error: unknown): readonly string[] {
  if (error instanceof Error && 'issues' in error) {
    const issues = (error as { issues: readonly ValidationIssue[] }).issues
    return issues.map((i) => i.code)
  }
  return []
}
