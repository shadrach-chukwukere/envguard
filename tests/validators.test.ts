import { describe, expect, it } from 'vitest'
import { defineConfig, validateEnv, v } from '../src'

function envOf(records: Record<string, string>) {
  return records as Record<string, unknown>
}

// ---------------------------------------------------------------------------
// string
// ---------------------------------------------------------------------------

describe('v.string', () => {
  it('passes a valid string', () => {
    const schema = defineConfig({ NAME: v.string() })
    const env = validateEnv(envOf({ NAME: 'alice' }), schema)
    expect(env.NAME).toBe('alice')
  })

  it('treats an empty required string as missing', () => {
    const schema = defineConfig({ NAME: v.string() })
    expect(() => validateEnv(envOf({ NAME: '' }), schema)).toThrow()
  })

  it('minLength rejects too-short values', () => {
    const schema = defineConfig({ NAME: v.string({ minLength: 5 }) })
    expect(() => validateEnv(envOf({ NAME: 'bob' }), schema)).toThrow()
  })

  it('maxLength rejects too-long values', () => {
    const schema = defineConfig({ NAME: v.string({ maxLength: 3 }) })
    expect(() => validateEnv(envOf({ NAME: 'longname' }), schema)).toThrow()
  })

  it('pattern rejects values that do not match', () => {
    const schema = defineConfig({ CODE: v.string({ pattern: /^[A-Z]{3}$/ }) })
    expect(() => validateEnv(envOf({ CODE: 'abc' }), schema)).toThrow()
    expect(validateEnv(envOf({ CODE: 'ABC' }), schema).CODE).toBe('ABC')
  })

  it('custom message is used', () => {
    const schema = defineConfig({
      NAME: v.string({ minLength: 5 }).message('NAME is too short'),
    })
    try {
      validateEnv(envOf({ NAME: 'bob' }), schema)
    } catch (error) {
      const issues = (error as { issues: readonly { message: string }[] }).issues
      const first = issues[0]!
      expect(first.message).toBe('NAME is too short')
      return
    }
    throw new Error('expected validation to fail')
  })
})

// ---------------------------------------------------------------------------
// number / integer
// ---------------------------------------------------------------------------

describe('v.number', () => {
  it('parses a numeric string', () => {
    const schema = defineConfig({ PORT: v.number() })
    expect(validateEnv(envOf({ PORT: '3000' }), schema).PORT).toBe(3000)
  })

  it('parses negative and decimal numbers', () => {
    const schema = defineConfig({ RATE: v.number() })
    expect(validateEnv(envOf({ RATE: '-2.5' }), schema).RATE).toBe(-2.5)
  })

  it('rejects non-numeric values', () => {
    const schema = defineConfig({ PORT: v.number() })
    expect(() => validateEnv(envOf({ PORT: 'not-a-number' }), schema)).toThrow()
  })

  it('enforces minimum', () => {
    const schema = defineConfig({ PORT: v.number({ min: 1 }) })
    expect(() => validateEnv(envOf({ PORT: '0' }), schema)).toThrow()
    expect(validateEnv(envOf({ PORT: '1' }), schema).PORT).toBe(1)
  })

  it('enforces maximum', () => {
    const schema = defineConfig({ PORT: v.number({ max: 100 }) })
    expect(() => validateEnv(envOf({ PORT: '200' }), schema)).toThrow()
  })
})

describe('v.integer', () => {
  it('parses integers', () => {
    const schema = defineConfig({ COUNT: v.integer() })
    expect(validateEnv(envOf({ COUNT: '42' }), schema).COUNT).toBe(42)
  })

  it('rejects non-integer numbers', () => {
    const schema = defineConfig({ COUNT: v.integer() })
    expect(() => validateEnv(envOf({ COUNT: '3.5' }), schema)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// boolean
// ---------------------------------------------------------------------------

describe('v.boolean', () => {
  it.each([
    ['true', true],
    ['1', true],
    ['yes', true],
    ['on', true],
    ['True', true],
    ['false', false],
    ['0', false],
    ['no', false],
    ['off', false],
    ['False', false],
  ])('parses %s as %s', (input, expected) => {
    const schema = defineConfig({ DEBUG: v.boolean() })
    expect(validateEnv(envOf({ DEBUG: input }), schema).DEBUG).toBe(expected)
  })

  it('rejects invalid booleans', () => {
    const schema = defineConfig({ DEBUG: v.boolean() })
    expect(() => validateEnv(envOf({ DEBUG: 'maybe' }), schema)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// url
// ---------------------------------------------------------------------------

describe('v.url', () => {
  it('parses a valid URL into a URL instance', () => {
    const schema = defineConfig({ DATABASE_URL: v.url() })
    const url = validateEnv(envOf({ DATABASE_URL: 'https://example.com' }), schema).DATABASE_URL
    expect(url).toBeInstanceOf(URL)
    expect(url.hostname).toBe('example.com')
    expect(url.protocol).toBe('https:')
  })

  it('rejects invalid URLs', () => {
    const schema = defineConfig({ DATABASE_URL: v.url() })
    expect(() => validateEnv(envOf({ DATABASE_URL: 'not-a-url' }), schema)).toThrow()
    expect(() => validateEnv(envOf({ DATABASE_URL: '' }), schema)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// email
// ---------------------------------------------------------------------------

describe('v.email', () => {
  it('accepts valid email addresses', () => {
    const schema = defineConfig({ ADMIN_EMAIL: v.email() })
    expect(validateEnv(envOf({ ADMIN_EMAIL: 'a@b.co' }), schema).ADMIN_EMAIL).toBe('a@b.co')
  })

  it('rejects invalid email addresses', () => {
    const schema = defineConfig({ ADMIN_EMAIL: v.email() })
    expect(() => validateEnv(envOf({ ADMIN_EMAIL: 'not-an-email' }), schema)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// port
// ---------------------------------------------------------------------------

describe('v.port', () => {
  it('accepts valid ports', () => {
    const schema = defineConfig({ PORT: v.port() })
    expect(validateEnv(envOf({ PORT: '80' }), schema).PORT).toBe(80)
    expect(validateEnv(envOf({ PORT: '65535' }), schema).PORT).toBe(65535)
  })

  it('rejects out-of-range ports', () => {
    const schema = defineConfig({ PORT: v.port() })
    expect(() => validateEnv(envOf({ PORT: '65536' }), schema)).toThrow()
    expect(() => validateEnv(envOf({ PORT: '-1' }), schema)).toThrow()
    expect(() => validateEnv(envOf({ PORT: 'abc' }), schema)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// enum
// ---------------------------------------------------------------------------

describe('v.enum', () => {
  it('accepts allowed values', () => {
    const schema = defineConfig({ NODE_ENV: v.enum(['development', 'production', 'test']) })
    expect(validateEnv(envOf({ NODE_ENV: 'production' }), schema).NODE_ENV).toBe('production')
  })

  it('rejects disallowed values', () => {
    const schema = defineConfig({ NODE_ENV: v.enum(['development', 'production']) })
    expect(() => validateEnv(envOf({ NODE_ENV: 'staging' }), schema)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// json
// ---------------------------------------------------------------------------

describe('v.json', () => {
  it('parses valid JSON', () => {
    const schema = defineConfig({ FEATURES: v.json() })
    expect(validateEnv(envOf({ FEATURES: '{"a":1}' }), schema).FEATURES).toEqual({ a: 1 })
  })

  it('rejects invalid JSON', () => {
    const schema = defineConfig({ FEATURES: v.json() })
    expect(() => validateEnv(envOf({ FEATURES: 'not-json' }), schema)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// array
// ---------------------------------------------------------------------------

describe('v.array', () => {
  it('splits comma-separated values into strings', () => {
    const schema = defineConfig({ HOSTS: v.array(v.string()) })
    expect(validateEnv(envOf({ HOSTS: 'a,b,c' }), schema).HOSTS).toEqual(['a', 'b', 'c'])
  })

  it('parses each item with the item validator', () => {
    const schema = defineConfig({ PORTS: v.array(v.number()) })
    expect(validateEnv(envOf({ PORTS: '80,443' }), schema).PORTS).toEqual([80, 443])
  })

  it('rejects when an item is invalid', () => {
    const schema = defineConfig({ PORTS: v.array(v.number()) })
    expect(() => validateEnv(envOf({ PORTS: '80,abc' }), schema)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// custom
// ---------------------------------------------------------------------------

describe('v.custom', () => {
  it('uses the custom function to parse', () => {
    const schema = defineConfig({
      CODE: v.custom((input) => input.toUpperCase()),
    })
    expect(validateEnv(envOf({ CODE: 'abc' }), schema).CODE).toBe('ABC')
  })

  it('reports custom validation failures', () => {
    const schema = defineConfig({
      CODE: v.custom((input) => {
        if (input.length < 3) throw new Error('too short')
        return input
      }),
    })
    expect(() => validateEnv(envOf({ CODE: 'ab' }), schema)).toThrow()
  })
})
