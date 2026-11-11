# Changelog

## [1.0.0] - 2026-11-10

### Added
- `defineConfig()` — declare environment variable schemas with TypeScript inference
- `validateEnv()` — validate and return frozen, typed configuration (throws on failure)
- `safeValidateEnv()` — validate without throwing, returns `{ config, issues, success }`
- `v` validator factory: `string`, `number`, `integer`, `boolean`, `url`, `email`, `port`, `enum`, `json`, `array`, `custom`
- Constraints: `default`, `defaultIfEnv`, `optional`, `required`, `sensitive`, `message`, `transform`, `ref`
- Numeric constraints: `min`, `max`
- String constraints: `minLength`, `maxLength`, `pattern`
- Array constraints: `separator`, `minItems`, `maxItems`
- Structured error system: `EnvGuardError`, `ValidationIssue`, stable `ErrorCode` constants
- Secret redaction: sensitive values never appear in errors, logs, or introspection
- Cross-variable validation via `.ref()` with access to sibling values and deployment env
- Environment-specific defaults via `.defaultIfEnv(env, value)`
- Strict mode to detect unexpected variables
- Schema introspection via `inspectSchema()` (safe, no secret defaults exposed)
- Immutable (deep-frozen) validated configuration output
- Zero runtime dependencies
- ESM and CommonJS builds via tsdown
- Vitest test suite with 61 tests
- GitHub Actions CI workflow
- README, LICENSE, CHANGELOG
