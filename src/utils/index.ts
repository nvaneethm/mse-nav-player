export function resolveUrl(uri: string, base: string): string {
    try {
      // If already a full URL (starts with http or https), return it directly
      const parsed = new URL(uri);
      return parsed.href;
    } catch {
      // Otherwise, resolve relative to base
      return new URL(uri, base).href;
    }
  }