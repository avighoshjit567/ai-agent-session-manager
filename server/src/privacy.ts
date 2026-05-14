/**
 * Best-effort masking of sensitive values in previews and exports.
 * Not a security boundary — users should keep full-content indexing off
 * if they handle real secrets.
 */

const PATTERNS: Array<{ re: RegExp; replace: string }> = [
  // Common token formats
  { re: /\b(sk-[a-zA-Z0-9_-]{20,})\b/g, replace: 'sk-***REDACTED***' },
  { re: /\b(ghp_[a-zA-Z0-9]{20,})\b/g, replace: 'ghp_***REDACTED***' },
  { re: /\b(github_pat_[a-zA-Z0-9_]{20,})\b/g, replace: 'github_pat_***REDACTED***' },
  { re: /\b(xox[abprs]-[a-zA-Z0-9-]{10,})\b/g, replace: 'xox***REDACTED***' },
  { re: /\b(AKIA[0-9A-Z]{16})\b/g, replace: 'AKIA***REDACTED***' },
  // JWTs
  {
    re: /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g,
    replace: '***JWT-REDACTED***',
  },
  // Private keys block
  {
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
    replace: '-----BEGIN PRIVATE KEY-----\n***REDACTED***\n-----END PRIVATE KEY-----',
  },
  // .env-style assignments containing secret-ish keys
  {
    re: /\b(API_KEY|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE_KEY|ACCESS_KEY|CLIENT_SECRET|DB_PASSWORD|DATABASE_URL)\s*[:=]\s*["']?([^"'\s\n,]{6,})["']?/gi,
    replace: '$1=***REDACTED***',
  },
];

export function maskSecrets(text: string | null | undefined): string {
  if (!text) return '';
  let out = text;
  for (const { re, replace } of PATTERNS) {
    out = out.replace(re, replace);
  }
  return out;
}

export function looksSensitive(text: string | null | undefined): boolean {
  if (!text) return false;
  return PATTERNS.some(({ re }) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

/**
 * Files the app must never read or index.
 */
export const FORBIDDEN_FILES = new Set([
  'auth.json',
  'config.toml',
  'settings.json',
  'settings.local.json',
]);

export function isForbidden(filename: string): boolean {
  return FORBIDDEN_FILES.has(filename);
}
