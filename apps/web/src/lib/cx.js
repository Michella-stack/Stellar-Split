/**
 * Joins class names, skipping falsy values.
 * @param {...(string | false | null | undefined)} parts
 */
export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}
