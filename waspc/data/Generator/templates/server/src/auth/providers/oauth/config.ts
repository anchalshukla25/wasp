export function mergeDefaultAndUserConfig(
  defaultConfig: Record<string, unknown>,
  userConfigFn?: () => Record<string, unknown>,
): Record<string, unknown> {
    if (!userConfigFn) {
        return defaultConfig;
    }
    return {
      ...defaultConfig,
      ...userConfigFn(),
    }
}
