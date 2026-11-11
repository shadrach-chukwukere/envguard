/**
 * Validation engine: `defineConfig`, `validateEnv`, `safeValidateEnv`,
 * and `inspectSchema`.
 */

import type {
  AnyValidator,
  ParseContext,
  RefContext,
} from './validators'
import type {
  InferConfig,
  SafeValidationResult,
  ValidateEnvOptions,
  ValidationIssue,
} from './types'
import { ErrorCode, createValidationError, issue } from './errors'
import { resolveDeploymentEnv } from './env'
import { deepFreeze, normalizeEnvValue } from './utils'

// ---------------------------------------------------------------------------
// Schema definition
// ---------------------------------------------------------------------------

/**
 * Declare an environment schema. Returns the schema unchanged so TypeScript
 * infers the typed config from the validator chains you pass in.
 *
 * ```ts
 * const schema = defineConfig({
 *   PORT: v.number().default(3000),
 *   DATABASE_URL: v.url(),
 * })
 * ```
 */
export function defineConfig<Schema extends Record<string, AnyValidator>>(
  schema: Schema,
): Schema {
  return schema
}

// ---------------------------------------------------------------------------
// Validation engine
// ---------------------------------------------------------------------------

export function validateEnv<Schema extends Record<string, AnyValidator>>(
  env: Record<string, unknown>,
  schema: Schema,
  options: ValidateEnvOptions = {},
): InferConfig<Schema> {
  const result = safeValidateEnv(env, schema, options)
  if (!result.success) {
    throw createValidationError([...result.issues])
  }
  return result.config as InferConfig<Schema>
}

export function safeValidateEnv<Schema extends Record<string, AnyValidator>>(
  env: Record<string, unknown>,
  schema: Schema,
  options: ValidateEnvOptions = {},
): SafeValidationResult<InferConfig<Schema>> {
  const deploymentEnv = resolveDeploymentEnv(options.env)
  const issues: ValidationIssue[] = []
  const result: Record<string, unknown> = {}
  const declared = new Set(Object.keys(schema))

  for (const [variable, field] of Object.entries(schema)) {
    const def = field.getDefinition()
    const input = normalizeEnvValue(env[variable])

    let value: unknown
    let missing = false

    if (input === undefined) {
      if (def.defaultIfEnv?.[deploymentEnv] !== undefined) {
        value = def.defaultIfEnv[deploymentEnv]
      } else if (def.defaultValue !== undefined) {
        value = def.defaultValue
      } else if (def.isOptional) {
        value = undefined
      } else {
        issues.push(
          issue(variable, ErrorCode.MISSING, `Required environment variable is not set`, {
            expected: def.displayName,
          }),
        )
        missing = true
      }
    } else {
      const ctx: ParseContext = {
        variable,
        deploymentEnv,
        env: result,
        addIssue: (problem) => issues.push({ variable, ...problem }),
      }
      value = def.parse(input, ctx)
      if (value === undefined && !issues.some((i) => i.variable === variable)) {
        issues.push(
          issue(variable, ErrorCode.INVALID_TYPE, `Failed to parse ${def.displayName}`, {
            expected: def.displayName,
          }),
        )
      }
    }

    if (!missing && def.ref) {
      const refCtx: RefContext<unknown> = {
        variable,
        value,
        env: result,
        deploymentEnv,
        addIssue: (problem) => issues.push({ variable, ...problem }),
        fail: (code, message, expected, received) => {
          issues.push(issue(variable, code as ErrorCode, message, { expected, received }))
          throw new Error(`Cross-variable rule failed for ${variable}`)
        },
      }
      try {
        def.ref(refCtx)
      } catch {
        // Cross-variable rules report issues via addIssue/fail.
      }
    }

    if (!missing) {
      result[variable] = value
    }
  }

  // Strict mode: reject variables present in `env` but not declared in schema.
  if (options.strict) {
    for (const key of Object.keys(env)) {
      if (!declared.has(key)) {
        issues.push(
          issue(key, ErrorCode.UNEXPECTED, `Unexpected environment variable not declared in schema`, {
            expected: 'declared schema variable',
            received: 'string',
          }),
        )
      }
    }
  }

  if (issues.length > 0) {
    return {
      config: null,
      issues: Object.freeze([...issues]),
      success: false,
    }
  }

  return {
    config: deepFreeze(result) as InferConfig<Schema>,
    issues: [],
    success: true,
  }
}

// ---------------------------------------------------------------------------
// Schema introspection (safe: never reveals sensitive defaults or values)
// ---------------------------------------------------------------------------

export interface SchemaFieldInfo {
  variable: string
  kind: string
  required: boolean
  optional: boolean
  sensitive: boolean
  hasDefault: boolean
  envSpecific: boolean
}

/**
 * Inspect a schema and produce a safe configuration reference.
 * Default values of sensitive fields are never exposed.
 */
export function inspectSchema<Schema extends Record<string, AnyValidator>>(
  schema: Schema,
): SchemaFieldInfo[] {
  return Object.entries(schema).map(([variable, field]) => {
    const def = field.getDefinition()
    return {
      variable,
      kind: def.kind,
      required: def.isRequired && !def.isOptional && def.defaultValue === undefined,
      optional: def.isOptional,
      sensitive: def.sensitive,
      hasDefault: def.defaultValue !== undefined || def.defaultIfEnv !== undefined,
      envSpecific: def.defaultIfEnv !== undefined,
    }
  })
}
