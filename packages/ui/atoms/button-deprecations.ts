const warnedDeprecatedValues = new Set<string>();

function isProductionEnvironment(): boolean {
  return (
    (
      globalThis as {
        readonly process?: {
          readonly env?: { readonly NODE_ENV?: string };
        };
      }
    ).process?.env?.NODE_ENV === 'production'
  );
}

export function warnDeprecatedButtonValue(
  kind: 'variant' | 'size',
  value: string,
  replacement: string
): void {
  if (isProductionEnvironment()) return;
  const key = `${kind}:${value}`;
  if (warnedDeprecatedValues.has(key)) return;
  warnedDeprecatedValues.add(key);
  console.warn(
    `[Button] ${kind}="${value}" is deprecated. Use ${kind}="${replacement}" instead.`
  );
}
