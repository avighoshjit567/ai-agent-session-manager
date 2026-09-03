// Renders user-written task descriptions as safe HTML where http(s) URLs
// become new-tab links. Everything is HTML-escaped first, so arbitrary text
// (including a crafted URL) can never inject markup.

const URL_RE = /https?:\/\/[^\s<]+/g;
const MAX_DISPLAY = 60;

export function shortenUrl(url: string): string {
  const display = url.replace(/^https?:\/\//, '');
  return display.length > MAX_DISPLAY ? display.slice(0, MAX_DISPLAY) + '…' : display;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Card previews: URLs out, so a description that is mostly links still reads
// as a one-line summary; the card shows a link-count chip instead.
export function stripUrls(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.replace(URL_RE, '').replace(/[ \t]{2,}/g, ' ').trim();
}

export function countUrls(raw: string | null | undefined): number {
  if (!raw) return 0;
  return [...raw.matchAll(URL_RE)].length;
}

export function linkifyText(raw: string | null | undefined): string {
  if (!raw) return '';
  let out = '';
  let last = 0;
  for (const m of raw.matchAll(URL_RE)) {
    let url = m[0];
    // Trailing sentence punctuation is almost never part of the URL.
    const trimmed = url.replace(/[.,;:!?)\]]+$/, '');
    const trailer = url.slice(trimmed.length);
    url = trimmed;
    out += escapeHtml(raw.slice(last, m.index));
    out +=
      `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" ` +
      `class="text-violet-500 hover:text-violet-400 underline underline-offset-2 break-all">` +
      `${escapeHtml(shortenUrl(url))}</a>`;
    out += escapeHtml(trailer);
    last = m.index + m[0].length;
  }
  out += escapeHtml(raw.slice(last));
  return out.replace(/\n/g, '<br>');
}
