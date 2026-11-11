# EnvGuard

TypeScript-first environment variable validation for Node.js.

> "Know your application configuration is valid before your application starts."

EnvGuard helps developers define, validate, parse, document, and safely access
application environment variables. It is designed for production use: excellent
TypeScript inference, structured errors that avoid exposing secret values, cross-variable
validation, environment-specific rules, immutable output, and zero runtime
dependencies.

## Why EnvGuard?

Existing libraries like Envalid cover typed validation and immutability. EnvGuard's
differentiator is **developer experience**:

- Simple, chainable schema definitions (`defineConfig` + `v`)
- Deep TypeScript inference — `env.PORT` is `number`, `env.DEBUG` is `boolean`
- Structured errors that avoid exposing input values, with stable codes (`ERR_ENV_MISSING`, etc.)
- All errors collected and reported together, not just the first
- Cross-variable validation via `.ref()` (e.g., require a secret in production)
- Environment-specific defaults via `.defaultIfEnv()`
- Sensitive values redacted from errors, logs, and introspection
- Immutable, deep-frozen configuration output
- Zero runtime dependencies

## Installation

```bash
npm install envguard
```

Requires Node.js 20+.

## Quick start

```typescript
import { defineConfig, validateEnv, v } from 'envguard'

const schema = defineConfig({
  PORT: v.number().default(3000),

  NODE_ENV: v.enum(['development', 'production', 'test']).default('development'),

  DATABASE_URL: v.url(),

  API_SECRET: v.string({ minLength: 20, sensitive: true }),

  DEBUG: v.boolean().default(false),
})

export const env = validateEnv(process.env, schema)

// env.PORT       // number
// env.DEBUG      // boolean
// env.DATABASE_URL // URL
```

EnvGuard is a library, not a server or command-line app. Add the schema and
`validateEnv()` call near the start of your application, before opening a
database connection or listening for requests. A validation error throws an
`EnvGuardError` and stops startup, so misconfiguration is caught early.

For local development, Node.js 20.6+ can load a `.env` file with its built-in
`--env-file` option:

```bash
node --env-file=.env src/index.js
```

If your application already uses a `.env` loader, load it before calling
`validateEnv()`. EnvGuard validates the object you pass in; it does not load
files or modify `process.env`.

### Use in an application

Install EnvGuard, then create a module such as `src/config.ts`:

```typescript
import { defineConfig, validateEnv, v } from 'envguard'

const schema = defineConfig({
  PORT: v.port().default(3000),
  DATABASE_URL: v.url(),
  API_SECRET: v.string({ minLength: 20, sensitive: true }),
})

export const env = validateEnv(process.env, schema)
```

Import that module before starting the rest of your app:

```typescript
import { env } from './config.js'

await startServer({ port: env.PORT, databaseUrl: env.DATABASE_URL })
```

For this package itself, `npm run build` creates the ESM, CommonJS, and
TypeScript declaration files in `dist/`. There is no `npm start` command
because EnvGuard does not run as a standalone process.

## API reference

### `defineConfig(schema)`

Declare your environment schema. Pass an object where keys are variable names
and values are validator chains created with `v`. Returns the schema unchanged;
TypeScript infers the typed config from the validator chains.

```typescript
const schema = defineConfig({
  PORT: v.number().default(3000),
  DATABASE_URL: v.url(),
})
```

### `validateEnv(env, schema, options?)`

Validate environment variables against a schema. Returns the typed,
immutable configuration object. Throws `EnvGuardError` if validation fails.

```typescript
const env = validateEnv(process.env, schema)
```

**Options:**

- `env` — deployment environment (`'development' | 'production' | 'test'`).
  Defaults to `NODE_ENV` or `'development'`.
- `strict` — when `true`, variables present in `env` but not declared in the
  schema are reported as errors. Defaults to `false`.

```typescript
const env = validateEnv(process.env, schema, { env: 'production', strict: true })
```

### `safeValidateEnv(env, schema, options?)`

Same as `validateEnv` but never throws. Returns:

```typescript
{ config: Config | null, issues: readonly ValidationIssue[], success: boolean }
```

### `v` — validator factory

```typescript
import { v } from 'envguard'

v.string()        // Validator<string>
v.number()        // Validator<number>
v.integer()       // Validator<number>
v.boolean()       // Validator<boolean>
v.url()           // Validator<URL>
v.email()         // Validator<string>
v.port()          // Validator<number>
v.enum(values)    // Validator<string>
v.json()          // Validator<unknown>
v.array(item)     // Validator<T[]>
v.custom(fn)      // Validator<T>
```

### `EnvGuardError`

Aggregated validation error thrown by `validateEnv`. Contains `issues` (readonly
array of `ValidationIssue`) and a `toJSON()` method for safe serialization.

### `ErrorCode`

Stable error codes: `MISSING`, `UNEXPECTED`, `INVALID_TYPE`, `BELOW_MINIMUM`,
`ABOVE_MAXIMUM`, `TOO_SHORT`, `TOO_LONG`, `PATTERN_MISMATCH`, `INVALID_ENUM`,
`INVALID_JSON`, `INVALID_URL`, `INVALID_PORT`, `CUSTOM_VALIDATION`,
`CROSS_VARIABLE`.

### `inspectSchema(schema)`

Produce a safe configuration reference from a schema. Sensitive defaults are
never exposed.

```typescript
const fields = inspectSchema(schema)
// [{ variable: 'PORT', kind: 'number', required: false, ... }]
```

## Every validator

### `v.string(options?)`

Parses a string value. Empty required strings are treated as missing.

Options: `minLength`, `maxLength`, `pattern`, `sensitive`.

```typescript
v.string({ minLength: 5, maxLength: 100, pattern: /^[A-Z]+$/, sensitive: true })
```

### `v.number(options?)`

Parses a numeric string (integers, decimals, negatives, scientific notation).
Accepts: `42`, `-3.14`, `1e5`, `+7`.

Options: `min`, `max`, `sensitive`.

```typescript
v.number({ min: 1, max: 65535 })
```

### `v.integer(options?)`

Like `v.number` but requires a whole number. Rejects `3.5`.

Options: `min`, `max`, `sensitive`.

```typescript
v.integer({ min: 0 })
```

### `v.boolean()`

Parses boolean strings. Accepted values (case-insensitive):

| Value | Parses to |
|-------|-----------|
| `true`, `1`, `yes`, `on` | `true` |
| `false`, `0`, `no`, `off` | `false` |

Anything else is rejected.

```typescript
v.boolean()
```

### `v.url()`

Parses a string into a `URL` instance using the `URL` constructor.

```typescript
v.url()
// env.DATABASE_URL is URL
```

### `v.email()`

Validates a simple email format (`something@something.something`).

```typescript
v.email()
```

### `v.port()`

Parses a TCP/UDP port number (`0`–`65535`).

```typescript
v.port()
```

### `v.enum(values)`

Requires the value to be exactly one of the allowed strings.

```typescript
v.enum(['development', 'production', 'test'])
```

### `v.json()`

Parses a JSON string into a JavaScript value (object, array, string, number,
boolean, null).

```typescript
v.json()
// env.FEATURES is unknown
```

### `v.array(item, options?)`

Splits a comma-separated string and parses each item with `item`.

Options: `separator`, `minItems`, `maxItems`.

```typescript
v.array(v.number(), { separator: ';', minItems: 1 })
// env.PORTS is number[]
```

### `v.custom(fn)`

Uses a custom function to parse. Throw an error to reject.

```typescript
v.custom((input) => input.toUpperCase())
```

## Validator modifiers

Modifiers are chainable and update the validator they are called on. Create a
separate validator for each schema field instead of reusing one validator
instance across multiple fields:

| Modifier | Description |
|----------|-------------|
| `.default(value)` | Use `value` when the variable is unset |
| `.defaultIfEnv(env, value)` | Use `value` when unset and deployment env matches |
| `.optional()` | Variable is optional (`undefined` when unset) |
| `.required()` | Explicitly required (default) |
| `.sensitive()` | Redact value from errors and introspection |
| `.message(fn or string)` | Custom error message |
| `.transform(fn)` | Transform the parsed value |
| `.ref(fn)` | Cross-variable validation rule |
| `.min(n)` | Minimum value (number) |
| `.max(n)` | Maximum value (number) |
| `.minLength(n)` | Minimum string length |
| `.maxLength(n)` | Maximum string length |
| `.pattern(regex)` | String must match regex |
| `.separator(s)` | Array item separator |
| `.minItems(n)` | Minimum array items |
| `.maxItems(n)` | Maximum array items |

## Defaults and optional values

```typescript
const schema = defineConfig({
  PORT: v.number().default(3000),           // default when missing
  HOST: v.string().default('localhost'),    // default when missing
  API_SECRET: v.string().optional(),        // undefined when missing
  DEBUG: v.boolean().default(false),        // default when missing
})
```

Empty strings (`''`) are treated as unset, so defaults apply.

## Environment-specific rules

Use `.defaultIfEnv()` for different defaults per deployment environment:

```typescript
const schema = defineConfig({
  API_URL: v.string()
    .defaultIfEnv('development', 'http://localhost:3000')
    .defaultIfEnv('production', 'https://api.example.com')
    .defaultIfEnv('test', 'http://test.local')
    .optional(),
})

const env = validateEnv(process.env, schema, { env: 'production' })
// env.API_URL === 'https://api.example.com'
```

## Cross-variable validation

Use `.ref()` to validate involving multiple environment variables. The ref
callback receives the current value, the partially-resolved env, and the
deployment environment.

```typescript
const schema = defineConfig({
  NODE_ENV: v.enum(['development', 'production', 'test']).default('development'),
  API_SECRET: v.string({ sensitive: true }).optional().ref((ctx) => {
    if (ctx.deploymentEnv === 'production' && !ctx.value) {
      ctx.fail(
        'ERR_ENV_CROSS_VARIABLE',
        'API_SECRET is required when NODE_ENV is production',
        'string',
        'undefined',
      )
    }
  }),
})

const env = validateEnv(process.env, schema, { env: 'production' })
```

## Error handling

All validation failures are collected and reported together as an
`EnvGuardError`:

```typescript
try {
  const env = validateEnv(process.env, schema)
} catch (error) {
  if (error instanceof EnvGuardError) {
    console.log(error.message)       // human-readable
    console.log(error.issues)        // [{ variable, code, message, expected, received }]
    console.log(JSON.stringify(error)) // JSON-serializable, secret-safe
  }
}
```

Each `ValidationIssue` contains:

- `variable` — environment variable name
- `code` — stable error code (e.g. `ERR_ENV_MISSING`); use the exported
  `ErrorCode` constants for programmatic checks
- `message` — human-readable message
- `expected` — expected type or value shape
- `received` — received *type* (never a secret value)

## Secret redaction

Fields marked `.sensitive()` suppress received-value details in built-in errors,
and sensitive defaults are omitted from `inspectSchema()`. Custom validator and
cross-variable callbacks control their own error messages, so do not include
secret values in messages they create.

```typescript
v.string({ minLength: 20, sensitive: true })

// Error message: "API_SECRET: Expected at least 20 characters"
// received: undefined (never leaks the actual value)
```

## TypeScript examples

```typescript
import { defineConfig, validateEnv, v, type InferConfig } from 'envguard'

const schema = defineConfig({
  PORT: v.number().default(3000),
  DATABASE_URL: v.url(),
  DEBUG: v.boolean().default(false),
})

type Env = InferConfig<typeof schema>
// { PORT: number; DATABASE_URL: URL; DEBUG: boolean }

const env = validateEnv(process.env, schema)
const port: number = env.PORT
```

## Framework integration examples

### Express

```typescript
import { defineConfig, validateEnv, v } from 'envguard'

const schema = defineConfig({
  PORT: v.port().default(3000),
  NODE_ENV: v.enum(['development', 'production']).default('development'),
  DATABASE_URL: v.url(),
})

const env = validateEnv(process.env, schema)

app.listen(env.PORT, () => {
  console.log(`Listening on ${env.PORT}`)
})
```

### Fastify

```typescript
const schema = defineConfig({
  PORT: v.port().default(3000),
  LOG_LEVEL: v.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
})

const env = validateEnv(process.env, schema)

const app = fastify({ logger: { level: env.LOG_LEVEL } })
await app.listen({ port: env.PORT })
```

### NestJS

```typescript
import { Injectable } from '@nestjs/common'
import { defineConfig, validateEnv, v } from 'envguard'

@Injectable()
export class ConfigService {
  readonly env = validateEnv(process.env, defineConfig({
    PORT: v.port().default(3000),
    DATABASE_URL: v.url(),
  }))
}
```

## Migration and compatibility

EnvGuard is a new library with no prior versions. There is no migration path from
other libraries, but the concepts are similar:

| From Envalid | To EnvGuard |
|--------------|-------------|
| `cleanEnv(env, schema)` | `validateEnv(env, schema)` |
| `str()` | `v.string()` |
| `num()` | `v.number()` |
| `bool()` | `v.boolean()` |
| `url()` | `v.url()` |
| `choices()` | `v.enum()` |
| `.default(x)` | `.default(x)` |
| `.devDefault(x)` | `.defaultIfEnv('development', x)` |

### CommonJS support

EnvGuard ships both ESM (`.mjs`) and CommonJS (`.cjs`) builds. The `exports`
map handles both. CommonJS consumers can `require('envguard')`.

## Limitations

- `v.enum()` infers `string` (not literal types) because allowed values are
  passed as a runtime array. Use a type annotation if you need literal types.
- `v.url()` uses the WHATWG `URL` constructor. It parses URL strings but does
  not restrict protocols; add a custom rule if your application only accepts
  specific protocols such as `https:`.
- `v.json()` accepts any valid JSON value, including `null`, `true`, `42`.
- Environment variables are always strings at runtime; `validateEnv` does not
  modify `process.env`.
- Non-string values in the input object (e.g. already-parsed numbers) are
  stringified before parsing.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run ci` (typecheck, lint, build, test)
5. Submit a pull request

## License

MIT License. See [LICENSE](LICENSE).
