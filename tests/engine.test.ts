import { describe, expect, it } from 'vitest'
import {
  defineConfig,
  EnvGuardError,
  ErrorCode,
  safeValidateEnv,
  validateEnv,
  v,
} from '../src'

function envOf(records: Record<string, string>) {
  return records as Record<string, unknown>
}

function expectValidationError(fn: () => unknown): EnvGuardError {
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(EnvGuardError)
    return error as EnvGuardError
  }
  throw new Error('expected validation to fail')
}

// ---------------------------------------------------------------------------
// Required / missing
// ---------------------------------------------------------------------------

describe('required variables', () => {
  it('rejects missing required variables with ERR_ENV_MISSING', () => {
    const schema = defineConfig({ DATABASE_URL: v.url() })
    const error = expectValidationError(() => validateEnv({}, schema))
    const issue = error.issues[0]
    expect(issue).toBeDefined()
    expect(issue!.code).toBe(ErrorCode.MISSING)
    expect(issue!.variable).toBe('DATABASE_URL')
    expect(issue!.expected).toBe('URL')
  })

  it('reports all missing variables together, not just the first', () => {
    const schema = defineConfig({
      DATABASE_URL: v.url(),
      API_SECRET: v.string(),
      PORT: v.number(),
    })
    const error = expectValidationError(() => validateEnv({}, schema))
    expect(error.issues.map((i) => i.variable)).toEqual([
      'DATABASE_URL',
      'API_SECRET',
      'PORT',
    ])
    expect(error.issues.every((i) => i.code === ErrorCode.MISSING)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

describe('defaults', () => {
  it('applies defaults when a variable is missing', () => {
    const schema = defineConfig({ PORT: v.number().default(3000) })
    const env = validateEnv({}, schema)
    expect(env.PORT).toBe(3000)
  })

  it('treats an empty string as unset and applies the default', () => {
    const schema = defineConfig({ PORT: v.number().default(3000) })
    const env = validateEnv(envOf({ PORT: '' }), schema)
    expect(env.PORT).toBe(3000)
  })

  it('uses the provided value when present even with a default', () => {
    const schema = defineConfig({ PORT: v.number().default(3000) })
    const env = validateEnv(envOf({ PORT: '8080' }), schema)
    expect(env.PORT).toBe(8080)
  })

  it('defaulted fields are not optional', () => {
    const schema = defineConfig({ PORT: v.number().default(3000) })
    const env = validateEnv({}, schema)
    expect(typeof env.PORT).toBe('number')
  })
})

// ---------------------------------------------------------------------------
// Optional
// ---------------------------------------------------------------------------

describe('optional variables', () => {
  it('returns undefined for missing optional variables', () => {
    const schema = defineConfig({ API_SECRET: v.string().optional() })
    const env = validateEnv({}, schema)
    expect(env.API_SECRET).toBeUndefined()
  })

  it('parses the value when present', () => {
    const schema = defineConfig({ API_SECRET: v.string().optional() })
    const env = validateEnv(envOf({ API_SECRET: 'secret' }), schema)
    expect(env.API_SECRET).toBe('secret')
  })
})

// ---------------------------------------------------------------------------
// Multiple errors
// ---------------------------------------------------------------------------

describe('aggregated errors', () => {
  it('validates all fields and reports multiple errors together', () => {
    const schema = defineConfig({
      DATABASE_URL: v.url(),
      PORT: v.number({ min: 1000 }),
      DEBUG: v.boolean(),
    })
    const error = expectValidationError(() =>
      validateEnv(envOf({ DATABASE_URL: 'nope', PORT: '500', DEBUG: 'maybe' }), schema),
    )
    expect(error.issues.length).toBeGreaterThan(1)
    expect(error.issues.map((i) => i.code)).toContain(ErrorCode.INVALID_URL)
    expect(error.issues.map((i) => i.code)).toContain(ErrorCode.BELOW_MINIMUM)
    expect(error.issues.map((i) => i.code)).toContain(ErrorCode.INVALID_TYPE)
  })
})

// ---------------------------------------------------------------------------
// safeValidateEnv
// ---------------------------------------------------------------------------

describe('safeValidateEnv', () => {
  it('returns success result without throwing', () => {
    const schema = defineConfig({ PORT: v.number().default(3000) })
    const result = safeValidateEnv({}, schema)
    expect(result.success).toBe(true)
    expect(result.config?.PORT).toBe(3000)
    expect(result.issues).toEqual([])
  })

  it('returns failure result with issues without throwing', () => {
    const schema = defineConfig({ DATABASE_URL: v.url() })
    const result = safeValidateEnv({}, schema)
    expect(result.success).toBe(false)
    expect(result.config).toBeNull()
    expect(result.issues.length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Secrets / sensitive redaction
// ---------------------------------------------------------------------------

describe('secret redaction', () => {
  it('does not include secret values in error messages', () => {
    const schema = defineConfig({
      API_SECRET: v.string({ minLength: 20, sensitive: true }),
    })
    const error = expectValidationError(() =>
      validateEnv(envOf({ API_SECRET: 'short' }), schema),
    )
    const serialized = JSON.stringify(error)
    expect(serialized).not.toContain('short')
    expect(error.issues[0]!.received).toBeUndefined()
  })

  it('still reports the issue type for sensitive fields', () => {
    const schema = defineConfig({
      API_SECRET: v.string({ minLength: 20, sensitive: true }),
    })
    const error = expectValidationError(() =>
      validateEnv(envOf({ API_SECRET: 'short' }), schema),
    )
    const first = error.issues[0]!
    expect(first.code).toBe(ErrorCode.TOO_SHORT)
    expect(first.message).toContain('20')
  })

  it('does not leak secret defaults through errors', () => {
    const schema = defineConfig({
      API_SECRET: v.string({ sensitive: true }).default('my-default-secret'),
    })
    const result = safeValidateEnv({}, schema)
    expect(result.success).toBe(true)
    expect((result.config as { API_SECRET: string }).API_SECRET).toBe('my-default-secret')
  })
})

// ---------------------------------------------------------------------------
// Cross-variable validation
// ---------------------------------------------------------------------------

describe('cross-variable validation', () => {
  it('requires a production secret when NODE_ENV is production', () => {
    const schema = defineConfig({
      NODE_ENV: v.enum(['development', 'production', 'test']).default('development'),
      API_SECRET: v.string({ sensitive: true }).optional().ref((ctx) => {
        if (ctx.deploymentEnv === 'production' && !ctx.value) {
          ctx.fail(
            ErrorCode.CROSS_VARIABLE,
            'API_SECRET is required when NODE_ENV is production',
            'string',
            'undefined',
          )
        }
      }),
    })
    const error = expectValidationError(() =>
      validateEnv(envOf({ NODE_ENV: 'production' }), schema, { env: 'production' }),
    )
    expect(error.issues.some((i) => i.code === ErrorCode.CROSS_VARIABLE)).toBe(true)
    expect(error.issues.some((i) => i.variable === 'API_SECRET')).toBe(true)
  })

  it('passes when the production secret is provided', () => {
    const schema = defineConfig({
      NODE_ENV: v.enum(['development', 'production', 'test']).default('development'),
      API_SECRET: v.string({ sensitive: true }).optional().ref((ctx) => {
        if (ctx.deploymentEnv === 'production' && !ctx.value) {
          ctx.fail(ErrorCode.CROSS_VARIABLE, 'required in production')
        }
      }),
    })
    const env = validateEnv(
      envOf({ NODE_ENV: 'production', API_SECRET: 'prod-secret-value' }),
      schema,
      { env: 'production' },
    )
    expect(env.API_SECRET).toBe('prod-secret-value')
  })
})

// ---------------------------------------------------------------------------
// Environment-specific defaults
// ---------------------------------------------------------------------------

describe('environment-specific defaults', () => {
  it('uses the env-specific default for the deployment environment', () => {
    const schema = defineConfig({
      API_URL: v.string()
        .defaultIfEnv('development', 'http://localhost:3000')
        .defaultIfEnv('production', 'https://api.example.com')
        .optional(),
    })
    const dev = validateEnv({}, schema, { env: 'development' })
    expect((dev as { API_URL?: string }).API_URL).toBe('http://localhost:3000')
    const prod = validateEnv({}, schema, { env: 'production' })
    expect((prod as { API_URL?: string }).API_URL).toBe('https://api.example.com')
  })
})

// ---------------------------------------------------------------------------
// Strict mode
// ---------------------------------------------------------------------------

describe('strict mode', () => {
  it('detects unexpected variables when enabled', () => {
    const schema = defineConfig({ PORT: v.number().default(3000) })
    const error = expectValidationError(() =>
      validateEnv(envOf({ PORT: '3000', UNKNOWN_VAR: 'x' }), schema, { strict: true }),
    )
    expect(error.issues.some((i) => i.code === ErrorCode.UNEXPECTED)).toBe(true)
  })

  it('does not report unexpected variables by default', () => {
    const schema = defineConfig({ PORT: v.number().default(3000) })
    const env = validateEnv(envOf({ PORT: '3000', UNKNOWN_VAR: 'x' }), schema)
    expect(env.PORT).toBe(3000)
  })
})

// ---------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------

describe('immutability', () => {
  it('returns a frozen object', () => {
    const schema = defineConfig({ PORT: v.number().default(3000) })
    const env = validateEnv({}, schema)
    expect(Object.isFrozen(env)).toBe(true)
  })

  it('freezes arrays produced by v.array', () => {
    const schema = defineConfig({ HOSTS: v.array(v.string()) })
    const env = validateEnv(envOf({ HOSTS: 'a,b' }), schema)
    expect(Object.isFrozen(env.HOSTS)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// process.env safety
// ---------------------------------------------------------------------------

describe('process.env safety', () => {
  it('does not modify process.env', () => {
    const before = { ...process.env }
    const schema = defineConfig({ PORT: v.number().default(3000) })
    validateEnv({}, schema)
    expect(process.env).toEqual(before)
  })
})
