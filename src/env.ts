/**
 * Deployment environment detection.
 *
 * EnvGuard never reads `process.env` automatically unless the caller passes
 * it in. This module only derives the *deployment environment* used for
 * environment-specific rules and defaults.
 */

export type Env = 'development' | 'production' | 'test'

const KNOWN_ENVS: readonly Env[] = ['development', 'production', 'test']

/**
 * Resolve the deployment environment.
 *
 * Priority: explicit `env` option > `process.env.NODE_ENV` (when recognized)
 * > `'development'`.
 *
 * This function does not throw and never logs values.
 */
export function resolveDeploymentEnv(env?: Env | null): Env {
  if (env !== undefined && env !== null) {
    return env
  }
  const fromProcess = typeof process !== 'undefined' ? process.env.NODE_ENV : undefined
  if (typeof fromProcess === 'string' && KNOWN_ENVS.includes(fromProcess as Env)) {
    return fromProcess as Env
  }
  return 'development'
}
