/**
 * A validator of any output type. Used for heterogeneous schema records where
 * each key can have a different validator output type.
 * @internal
 */
export type AnyValidator = Validator<any> // eslint-disable-line @typescript-eslint/no-explicit-any

import type { Env } from './env'
import type { ValidationIssue } from './types'
import { ErrorCode, issue } from './errors'
import { receivedType } from './utils'

// ---------------------------------------------------------------------------
// Brand symbol used by `defineConfig` / `inspectSchema` to recognise
// EnvGuard validator instances at runtime.
// ---------------------------------------------------------------------------

export const ENVGUARD_VALIDATOR = Symbol('envguard:validator')

// ---------------------------------------------------------------------------
// Internal field definition (runtime representation of a validator chain)
// ---------------------------------------------------------------------------

export interface FieldDefinition<T> {
  kind: string
  displayName: string
  parse: (input: string | undefined, ctx: ParseContext) => T | undefined
  defaultValue?: T
  defaultIfEnv?: Partial<Record<Env, T>>
  isOptional: boolean
  isRequired: boolean
  sensitive: boolean
  message?: string | ((ctx: MessageContext) => string)
  ref?: (ctx: RefContext<T>) => void
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  pattern?: RegExp
  separator?: string
  minItems?: number
  maxItems?: number
}

// ---------------------------------------------------------------------------
// Parser context (passed to every validator parse function)
// ---------------------------------------------------------------------------

export interface ParseContext {
  variable: string
  deploymentEnv: Env
  env: Record<string, unknown>
  addIssue: (issue: Omit<ValidationIssue, 'variable'>) => void
}

export interface RefContext<T> {
  variable: string
  value: T | undefined
  env: Record<string, unknown>
  deploymentEnv: Env
  addIssue: (issue: Omit<ValidationIssue, 'variable'>) => void
  fail: (
    code: string,
    message: string,
    expected?: string,
    received?: string,
  ) => never
}

export interface MessageContext {
  variable: string
  received?: string
  expected?: string
}

// ---------------------------------------------------------------------------
// Helper: build a validation issue and return `undefined` (the "invalid"
// signal used by parsers).
// ---------------------------------------------------------------------------

function reject<T>(
  def: FieldDefinition<T>,
  ctx: ParseContext,
  code: ErrorCode,
  defaultMessage: string,
  expected?: string,
  received?: string,
): T | undefined {
  const message =
    def.message !== undefined
      ? resolveMessage(def, ctx.variable, received, expected) ??
        defaultMessage
      : defaultMessage
  ctx.addIssue(issue(ctx.variable, code, message, { expected, received }))
  return undefined as unknown as T | undefined
}

function resolveMessage(
  def: FieldDefinition<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  variable: string,
  received?: string,
  expected?: string,
): string | undefined {
  if (def.message === undefined) return undefined
  const ctx: MessageContext = { variable, received, expected }
  return typeof def.message === 'function' ? def.message(ctx) : def.message
}

// ---------------------------------------------------------------------------
// Primitive parsers
// ---------------------------------------------------------------------------

const BOOLEAN_TRUE = new Set(['true', '1', 'yes', 'on'])
const BOOLEAN_FALSE = new Set(['false', '0', 'no', 'off'])
const NUMBER_PATTERN = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function parseString(input: string, ctx: ParseContext, def: FieldDefinition<string>): string | undefined {
  const value = input
  if (def.minLength !== undefined && value.length < def.minLength) {
    return reject(def, ctx, ErrorCode.TOO_SHORT, `Expected at least ${def.minLength} characters`, 'string', receivedType(value, def.sensitive))
  }
  if (def.maxLength !== undefined && value.length > def.maxLength) {
    return reject(def, ctx, ErrorCode.TOO_LONG, `Expected at most ${def.maxLength} characters`, 'string', receivedType(value, def.sensitive))
  }
  if (def.pattern !== undefined && !def.pattern.test(value)) {
    return reject(
      def,
      ctx,
      ErrorCode.PATTERN_MISMATCH,
      `Expected value to match pattern ${def.pattern}`,
      'string',
      receivedType(value, def.sensitive),
    )
  }
  return value
}

function parseNumber(input: string, ctx: ParseContext, def: FieldDefinition<number>): number | undefined {
  const trimmed = input.trim()
  if (!NUMBER_PATTERN.test(trimmed)) {
    return reject(def, ctx, ErrorCode.INVALID_TYPE, 'Expected a number', 'number', receivedType(input, def.sensitive))
  }
  const value = Number(trimmed)
  if (!Number.isFinite(value)) {
    return reject(def, ctx, ErrorCode.INVALID_TYPE, 'Expected a finite number', 'number', receivedType(input, def.sensitive))
  }
  if (def.min !== undefined && value < def.min) {
    return reject(def, ctx, ErrorCode.BELOW_MINIMUM, `Expected at least ${def.min}`, 'number', receivedType(value, def.sensitive))
  }
  if (def.max !== undefined && value > def.max) {
    return reject(def, ctx, ErrorCode.ABOVE_MAXIMUM, `Expected at most ${def.max}`, 'number', receivedType(value, def.sensitive))
  }
  return value
}

function parseBoolean(input: string, ctx: ParseContext): boolean | undefined {
  const lower = input.toLowerCase()
  if (BOOLEAN_TRUE.has(lower)) return true
  if (BOOLEAN_FALSE.has(lower)) return false
  ctx.addIssue(
    issue(
      ctx.variable,
      ErrorCode.INVALID_TYPE,
      "Expected a boolean (true, false, 1, 0, yes, no, on, off)",
      { expected: 'boolean', received: receivedType(input, false) },
    ),
  )
  return undefined
}

// ---------------------------------------------------------------------------
// Validator class
// ---------------------------------------------------------------------------

export class Validator<T> {
  readonly [ENVGUARD_VALIDATOR] = true
  readonly _type!: T
  private readonly def: FieldDefinition<T>

  constructor(def: FieldDefinition<T>) {
    this.def = def
  }

  /** Expose the runtime definition for schema introspection. */
  getDefinition(): FieldDefinition<T> {
    return this.def
  }

  private clone(updates: Partial<FieldDefinition<T>>): Validator<T> {
    Object.assign(this.def, updates)
    return this
  }

  /** Use `value` when the variable is unset. */
  default(value: T): Validator<T> {
    return this.clone({ defaultValue: value })
  }

  /** Use `value` when the variable is unset and the deployment env matches. */
  defaultIfEnv(env: Env, value: T): Validator<T> {
    return this.clone({
      defaultIfEnv: { ...this.def.defaultIfEnv, [env]: value },
    })
  }

  /** The variable is optional (undefined when unset). */
  optional(): Validator<T | undefined> {
    return this.clone({ isOptional: true }) as Validator<T | undefined>
  }

  /** Explicitly mark the variable as required (the default). */
  required(): Validator<T> {
    return this.clone({ isRequired: true })
  }

  /** Mark the value as sensitive: it is redacted from errors and introspection. */
  sensitive(): Validator<T> {
    return this.clone({ sensitive: true })
  }

  /** Override the error message for this field. */
  message(msg: string | ((ctx: MessageContext) => string)): Validator<T> {
    return this.clone({ message: msg })
  }

  /** Transform the parsed value. */
  transform<U>(fn: (value: T) => U): Validator<U> {
    const base = this.def.parse
    return new Validator({
      ...this.def,
      parse: (input: string | undefined, ctx: ParseContext) => {
        const value = base(input, ctx)
        if (value === undefined) return undefined
        return fn(value)
      },
    } as unknown as FieldDefinition<U>)
  }

  /** Cross-variable validation rule. Runs after the field is parsed. */
  ref(fn: (ctx: RefContext<T>) => void): Validator<T> {
    return this.clone({ ref: fn })
  }

  /* ---- numeric constraints (apply to number/integer/port) ---- */
  min(n: number): Validator<T> {
    return this.clone({ min: n })
  }
  max(n: number): Validator<T> {
    return this.clone({ max: n })
  }

  /* ---- string constraints ---- */
  minLength(n: number): Validator<T> {
    return this.clone({ minLength: n })
  }
  maxLength(n: number): Validator<T> {
    return this.clone({ maxLength: n })
  }
  pattern(regex: RegExp): Validator<T> {
    return this.clone({ pattern: regex })
  }

  /* ---- array constraints ---- */
  separator(s: string): Validator<T> {
    return this.clone({ separator: s })
  }
  minItems(n: number): Validator<T> {
    return this.clone({ minItems: n })
  }
  maxItems(n: number): Validator<T> {
    return this.clone({ maxItems: n })
  }
}

// ---------------------------------------------------------------------------
// `v` factory
// ---------------------------------------------------------------------------

export interface StringOptions {
  minLength?: number
  maxLength?: number
  pattern?: RegExp
  sensitive?: boolean
}

export interface NumberOptions {
  min?: number
  max?: number
  sensitive?: boolean
}

export interface ArrayOptions {
  separator?: string
  minItems?: number
  maxItems?: number
}

export interface Validators {
  string(options?: StringOptions): Validator<string>
  number(options?: NumberOptions): Validator<number>
  integer(options?: NumberOptions): Validator<number>
  boolean(): Validator<boolean>
  url(): Validator<URL>
  email(): Validator<string>
  port(): Validator<number>
  enum(values: readonly string[]): Validator<string>
  json(): Validator<unknown>
  array<T>(item: Validator<T>, options?: ArrayOptions): Validator<T[]>
  custom<T>(fn: (input: string, ctx: ParseContext) => T): Validator<T>
}

export const v: Validators = {
  string(options = {}) {
    const def: FieldDefinition<string> = {
      kind: 'string',
      displayName: 'string',
      sensitive: !!options.sensitive,
      isOptional: false,
      isRequired: true,
      minLength: options.minLength,
      maxLength: options.maxLength,
      pattern: options.pattern,
      parse: (input, ctx) => {
        if (input === undefined) return undefined
        return parseString(input, ctx, def)
      },
    }
    return new Validator(def)
  },

  number(options = {}) {
    const def: FieldDefinition<number> = {
      kind: 'number',
      displayName: 'number',
      sensitive: !!options.sensitive,
      isOptional: false,
      isRequired: true,
      min: options.min,
      max: options.max,
      parse: (input, ctx) => {
        if (input === undefined) return undefined
        return parseNumber(input, ctx, def)
      },
    }
    return new Validator(def)
  },

  integer(options = {}) {
    const def: FieldDefinition<number> = {
      kind: 'integer',
      displayName: 'integer',
      sensitive: !!options.sensitive,
      isOptional: false,
      isRequired: true,
      min: options.min,
      max: options.max,
      parse: (input, ctx) => {
        if (input === undefined) return undefined
        const value = parseNumber(input, ctx, def)
        if (value === undefined) return undefined
        if (!Number.isInteger(value)) {
          return reject(
            def,
            ctx,
            ErrorCode.INVALID_TYPE,
            'Expected an integer',
            'integer',
            receivedType(input, def.sensitive),
          )
        }
        return value
      },
    }
    return new Validator(def)
  },

  boolean() {
    const def: FieldDefinition<boolean> = {
      kind: 'boolean',
      displayName: 'boolean',
      sensitive: false,
      isOptional: false,
      isRequired: true,
      parse: (input, ctx) => {
        if (input === undefined) return undefined
        return parseBoolean(input, ctx)
      },
    }
    return new Validator(def)
  },

  url() {
    const def: FieldDefinition<URL> = {
      kind: 'url',
      displayName: 'URL',
      sensitive: false,
      isOptional: false,
      isRequired: true,
      parse: (input, ctx) => {
        if (input === undefined) return undefined
        try {
          return new URL(input)
        } catch {
          return reject(def, ctx, ErrorCode.INVALID_URL, 'Expected a valid URL', 'string', receivedType(input, false))
        }
      },
    }
    return new Validator(def)
  },

  email() {
    const def: FieldDefinition<string> = {
      kind: 'email',
      displayName: 'email',
      sensitive: false,
      isOptional: false,
      isRequired: true,
      parse: (input, ctx) => {
        if (input === undefined) return undefined
        if (!EMAIL_PATTERN.test(input)) {
          return reject(def, ctx, ErrorCode.INVALID_TYPE, 'Expected a valid email address', 'string', receivedType(input, false))
        }
        return input
      },
    }
    return new Validator(def)
  },

  port() {
    const def: FieldDefinition<number> = {
      kind: 'port',
      displayName: 'port',
      sensitive: false,
      isOptional: false,
      isRequired: true,
      min: 0,
      max: 65535,
      parse: (input, ctx) => {
        if (input === undefined) return undefined
        const value = parseNumber(input, ctx, def)
        if (value === undefined) return undefined
        if (!Number.isInteger(value)) {
          return reject(
            def,
            ctx,
            ErrorCode.INVALID_PORT,
            'Expected an integer port number',
            'integer between 0 and 65535',
            receivedType(input, def.sensitive),
          )
        }
        return value
      },
    }
    return new Validator(def)
  },

  enum(values: readonly string[]) {
    const allowed = Object.freeze([...values])
    const def: FieldDefinition<string> = {
      kind: 'enum',
      displayName: `enum(${allowed.map((v: string) => JSON.stringify(v)).join(', ')})`,
      sensitive: false,
      isOptional: false,
      isRequired: true,
      parse: (input, ctx) => {
        if (input === undefined) return undefined
        if (!allowed.includes(input)) {
          return reject(
            def,
            ctx,
            ErrorCode.INVALID_ENUM,
            `Expected one of [${allowed.map((v) => JSON.stringify(v)).join(', ')}]`,
            'string',
            receivedType(input, false),
          )
        }
        return input
      },
    }
    return new Validator(def)
  },

  json() {
    const def: FieldDefinition<unknown> = {
      kind: 'json',
      displayName: 'JSON',
      sensitive: false,
      isOptional: false,
      isRequired: true,
      parse: (input, ctx) => {
        if (input === undefined) return undefined
        try {
          return JSON.parse(input)
        } catch {
          return reject(def, ctx, ErrorCode.INVALID_JSON, 'Expected valid JSON', 'string', receivedType(input, false))
        }
      },
    }
    return new Validator(def)
  },

  array<T>(item: Validator<T>, options: ArrayOptions = {}) {
    const separator = options.separator ?? ','
    const def: FieldDefinition<T[]> = {
      kind: 'array',
      displayName: 'array',
      sensitive: false,
      isOptional: false,
      isRequired: true,
      separator,
      minItems: options.minItems,
      maxItems: options.maxItems,
      parse: (input, ctx) => {
        if (input === undefined) return undefined
        const parts = input.split(separator).map((p) => p.trim()).filter((p) => p !== '')
        if (def.minItems !== undefined && parts.length < def.minItems) {
          return reject(
            def,
            ctx,
            ErrorCode.INVALID_TYPE,
            `Expected at least ${def.minItems} item(s)`,
            'array',
            receivedType(parts, false),
          )
        }
        if (def.maxItems !== undefined && parts.length > def.maxItems) {
          return reject(
            def,
            ctx,
            ErrorCode.INVALID_TYPE,
            `Expected at most ${def.maxItems} item(s)`,
            'array',
            receivedType(parts, false),
          )
        }
        const result: T[] = []
        for (let i = 0; i < parts.length; i++) {
          const itemCtx: ParseContext = {
            ...ctx,
            variable: `${ctx.variable}[${i}]`,
          }
          const parsed = item.getDefinition().parse(parts[i], itemCtx)
          if (parsed === undefined) {
            // issue already added by item parser
            return undefined
          }
          result.push(parsed)
        }
        return result
      },
    }
    return new Validator(def)
  },

  custom<T>(fn: (input: string, ctx: ParseContext) => T) {
    const def: FieldDefinition<T> = {
      kind: 'custom',
      displayName: 'custom',
      sensitive: false,
      isOptional: false,
      isRequired: true,
      parse: (input, ctx) => {
        if (input === undefined) return undefined
        try {
          return fn(input, ctx)
        } catch {
          ctx.addIssue(
            issue(ctx.variable, ErrorCode.CUSTOM_VALIDATION, 'Custom validator rejected the value', {
              expected: 'custom',
              received: receivedType(input, def.sensitive),
            }),
          )
          return undefined
        }
      },
    }
    return new Validator(def)
  },
}
