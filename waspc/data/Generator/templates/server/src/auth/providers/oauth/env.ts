import { type ProviderConfig } from "wasp/auth/providers/types";

export function ensureEnvVarsForProvider<EnvVars extends string>(
  envVarNames: EnvVars[],
  provider: ProviderConfig,
): {
  [name in EnvVars]: string;
} {
  const result: {
    [name: string]: string;
  } = {};
  for (const envVarName of envVarNames) {
    if (!process.env[envVarName]) {
      throw new Error(`${envVarName} env variable is required when using the ${provider.displayName} auth provider.`);
    }
    result[envVarName] = process.env[envVarName];
  }
  return result as {
    [name in EnvVars]: string;
  };
}
