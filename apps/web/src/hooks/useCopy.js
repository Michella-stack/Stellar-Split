import { useCallback } from 'react';
import { useT } from './useT.js';
import { useToast } from './useToast.js';

/** Copies text to the clipboard and confirms with a toast. `messageKey` is the translated confirmation, e.g. 'copied.address'. */
export function useCopy() {
  const toast = useToast();
  const { t } = useT();
  return useCallback(
    async (text, messageKey = 'copied.fallback') => {
      try {
        await navigator.clipboard.writeText(text);
        toast(t(messageKey), { tone: 'success' });
      } catch {
        toast(t('copied.failed'), { tone: 'error' });
      }
    },
    [toast, t],
  );
}
