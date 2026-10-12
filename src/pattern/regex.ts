/** Escapes text for use inside a regular expression. */
export const escapeRegExp = (text: string): string => text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
