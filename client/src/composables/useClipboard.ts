import { useToast } from './useToast';

const toast = useToast();

export async function copy(text: string, label?: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext !== false) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    toast.success(label ? `Copied ${label}` : 'Copied');
    return true;
  } catch (e) {
    toast.error('Copy failed');
    return false;
  }
}
