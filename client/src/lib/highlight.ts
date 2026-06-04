// Converts an FTS5 snippet (using control-char sentinels around matched terms)
// into safe highlighted HTML. All non-sentinel content is HTML-escaped, so
// arbitrary conversation text can never inject markup.
const START = String.fromCharCode(2);
const END = String.fromCharCode(3);

export function highlightSnippet(raw: string | null | undefined): string {
  if (!raw || !raw.includes(START)) return '';
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .split(START)
    .join('<mark class="bg-amber-200/70 dark:bg-amber-400/25 text-inherit rounded-sm px-0.5">')
    .split(END)
    .join('</mark>');
}
