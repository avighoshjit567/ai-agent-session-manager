// Pure, dependency-free helpers for deriving session titles and search bodies.

const TITLE_MAX = 80;

const INJECTED_TAGS = [
  'ide_opened_file',
  'ide_selection',
  'system-reminder',
  'command-name',
  'command-message',
  'command-args',
  'local-command-stdout',
];

export function stripInjected(text: string): string {
  let out = text;
  for (const tag of INJECTED_TAGS) {
    out = out.replace(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'g'), '');
  }
  return out;
}

export function cleanForTitle(raw: string | null | undefined): string {
  if (!raw) return '';
  const stripped = stripInjected(raw);
  const firstLine = stripped
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return (firstLine ?? '').replace(/\s+/g, ' ').trim();
}

export function capWords(text: string, max = TITLE_MAX): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  const base = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return base.trimEnd() + '…';
}

export function deriveTitle(
  aiTitle: string | null | undefined,
  firstUserMessage: string | null | undefined,
): string | null {
  const ai = (aiTitle ?? '').trim();
  if (ai) return capWords(ai);
  const cleaned = cleanForTitle(firstUserMessage);
  if (!cleaned) return null;
  return capWords(cleaned);
}

export function capBody(text: string, maxChars = 200_000): string {
  if (!text) return '';
  return text.length <= maxChars ? text : text.slice(0, maxChars);
}
