// Test-only resolver: the app's source uses extensionless relative imports (the
// Next.js/TypeScript convention), which Node cannot resolve on its own. When a
// relative import fails, retry it with a .ts extension.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (error && error.code === 'ERR_MODULE_NOT_FOUND' && /^\.\.?\//.test(specifier) && !/\.[a-z]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw error;
  }
}
