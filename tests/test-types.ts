import { describe, expect, it } from 'vitest'
import { defineConfig, validateEnv, v } from '../src'

// ---------------------------------------------------------------------------
// Type inference is verified at compile time by tsc.
// These assignments ensure the inferred types match expectations.
// ---------------------------------------------------------------------------

const schema = defineConfig({
  PORT: v.number().default(3000),
  HOST: v.string().default('localhost'),
  DEBUG: v.boolean().default(false),
  NODE_ENV: v.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: v.url(),
  API_KEY: v.string().optional(),
  RATE: v.number({ min: 0, max: 1 }),
  COUNT: v.integer(),
  EMAIL: v.email(),
  PORT_NUM: v.port(),
  TAGS: v.array(v.string()).default([]),
  CONFIG: v.json().default({}),
  SECRET: v.string({ sensitive: true }).optional(),
})

const env = validateEnv({}, schema)

// number
const port: number = env.PORT
void port

// @ts-expect-error - PORT is number, not string
const wrongPort: string = env.PORT

// string
const host: string = env.HOST
void host

// @ts-expect-error - HOST is string, not number
const wrongHost: number = env.HOST

// boolean
const debug: boolean = env.DEBUG
void debug

// @ts-expect-error - DEBUG is boolean, not string
const wrongDebug: string = env.DEBUG

// enum: string (runtime-validated, not literal-typed)
const nodeEnv: string = env.NODE_ENV
void nodeEnv

// URL
const dbUrl: URL = env.DATABASE_URL
void dbUrl

// @ts-expect-error - DATABASE_URL is URL, not string
const wrongDbUrl: string = env.DATABASE_URL

// optional: string | undefined
const apiKey: string | undefined = env.API_KEY
void apiKey

// number with constraints
const rate: number = env.RATE
void rate
const count: number = env.COUNT
void count

// email: string
const email: string = env.EMAIL
void email

// port: number
const portNum: number = env.PORT_NUM
void portNum

// array: string[]
const tags: string[] = env.TAGS
void tags

// @ts-expect-error - TAGS is string[], not number[]
const wrongTags: number[] = env.TAGS

// json: unknown
const config: unknown = env.CONFIG
void config

// optional sensitive: string | undefined
const secret: string | undefined = env.SECRET
void secret

// ---------------------------------------------------------------------------
// Custom validator type inference
// ---------------------------------------------------------------------------

const customSchema = defineConfig({
  CODE: v.custom((input) => input.toUpperCase()).default('ABC'),
})

const customEnv = validateEnv({}, customSchema)
const code: string = customEnv.CODE
void code

// @ts-expect-error - CODE is string, not number
const wrongCode: number = customEnv.CODE

// ---------------------------------------------------------------------------
// validateEnv returns non-nullable config on success
// ---------------------------------------------------------------------------

const resultSchema = defineConfig({
  PORT: v.number().default(3000),
})
const resultEnv = validateEnv({}, resultSchema)
const resultPort: number = resultEnv.PORT
void resultPort

// ---------------------------------------------------------------------------
// Runtime assertions that types line up
// ---------------------------------------------------------------------------

describe('type inference runtime checks', () => {
  it('infers PORT as number', () => {
    expect(typeof env.PORT).toBe('number')
  })

  it('infers DEBUG as boolean', () => {
    expect(typeof env.DEBUG).toBe('boolean')
  })

  it('infers DATABASE_URL as URL', () => {
    const urlSchema = defineConfig({ DATABASE_URL: v.url() })
    const urlEnv = validateEnv({ DATABASE_URL: 'https://example.com' }, urlSchema)
    expect(urlEnv.DATABASE_URL).toBeInstanceOf(URL)
  })

  it('infers optional as undefined when missing', () => {
    const optSchema = defineConfig({ KEY: v.string().optional() })
    const optEnv = validateEnv({}, optSchema)
    expect(optEnv.KEY).toBeUndefined()
  })

  it('infers defaulted array as array', () => {
    expect(Array.isArray(env.TAGS)).toBe(true)
  })
})
