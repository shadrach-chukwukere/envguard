/**
 * EnvGuard — TypeScript-first environment variable validation for Node.js.
 *
 * Public API:
 * - `defineConfig(schema)` — declare your env schema
 * - `validateEnv(env, schema, options?)` — validate and return typed config (throws on failure)
 * - `safeValidateEnv(env, schema, options?)` — validate without throwing
 * - `v` — validator factory (string, number, integer, boolean, url, email, port, enum, json, array, custom)
 * - `EnvGuardError` — aggregated validation error
 * - `ErrorCode` — stable error codes
 * - `inspectSchema(schema)` — safe schema introspection
 * - `resolveDeploymentEnv(env?)` — deployment environment detection
 */

export {
  defineConfig,
  safeValidateEnv,
  validateEnv,
  inspectSchema,
  type SchemaFieldInfo,
} from './engine'
export { v, type Validators, type Validator } from './validators'
export type {
  FieldDefinition,
  ParseContext,
  RefContext,
  MessageContext,
} from './validators'
export {
  EnvGuardError,
  type ValidationIssue,
  type Env,
  type ValidateEnvOptions,
  type SafeValidationResult,
  type InferConfig,
} from './types'
export { ErrorCode } from './errors'
export { resolveDeploymentEnv, type Env as DeploymentEnv } from './env'
