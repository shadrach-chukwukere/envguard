/**
 * Core types for EnvGuard.
 *
 * This module defines the shared type model used by the validator
 * implementations, the validation engine, and the error system.
 */

import type { Validator } from './validators'

/**
 * Supported deployment environments. `validateEnv` accepts an explicit
 * `env` option; when omitted it is derived from `NODE_ENV` (defaulting
 * to `'development'`).
 */
export type Env = 'development' | 'production' | 'test'

/**
 * A single structured validation problem.
 *
 * `received` describes the *type* of the received value, never the value
 * itself, so secrets can never leak through error output.
 */
export interface ValidationIssue {
  /** The environment variable name the issue relates to. */
  variable: string
  /** Stable, machine-readable error code. */
  code: string
  /** Human-readable, actionable message. */
  message: string
  /** The expected type or value shape, where applicable. */
  expected?: string
  /** The received *type*, where safe to disclose. Never a secret value. */
  received?: string
}

/**
 * Aggregated error thrown by `validateEnv` when one or more variables fail
 * validation. All issues are collected and reported together.
 */
export class EnvGuardError extends Error {
  readonly name = 'EnvGuardError'
  readonly issues: readonly ValidationIssue[]

  constructor(message: string, issues: ValidationIssue[]) {
    super(message)
    this.issues = Object.freeze([...issues])
  }

  /** JSON-serializable representation, safe to log (no secret values). */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      issues: this.issues,
    }
  }
}

/**
 * Options accepted by `validateEnv` / `safeValidateEnv`.
 */
export interface ValidateEnvOptions {
  /**
   * Deployment environment used for environment-specific rules/defaults.
   * Defaults to `process.env.NODE_ENV` when it is one of the known envs,
   * otherwise `'development'`.
   */
  env?: Env
  /**
   * When `true`, environment variables present in `env` but not declared
   * in the schema are reported as validation failures.
   * @default false
   */
  strict?: boolean
}

/**
 * Result of `safeValidateEnv`, which never throws.
 */
export interface SafeValidationResult<Config> {
  /** The validated config, or `null` when validation failed. */
  config: Config | null
  /** All collected validation issues. */
  issues: readonly ValidationIssue[]
  success: boolean
}

/**
 * Extract the output type of a validator chain.
 */
export type ValidatorOutput<V> = V extends Validator<infer T> ? T : never

/**
 * Infer the fully-typed configuration object from a schema.
 *
 * Fields with a `.default()` infer as their value type (present at runtime).
 * Fields with `.optional()` infer as `T | undefined`.
 * Required fields (no default, not optional) infer as `T`.
 */
export type InferConfig<Schema> = {
  [K in keyof Schema]: ValidatorOutput<Schema[K]>
}
