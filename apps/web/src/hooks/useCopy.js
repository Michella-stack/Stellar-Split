import { useCallback } from 'react';
import { useToast } from './useToast.js';

/** Copies text to the clipboard and confirms with a toast. */
export function useCopy() {
  const toast = useToast();
  return useCallback(
    async (text, what = 'Copied') => {
      try {
        await navigator.clipboard.writeText(text);
        toast(`${what} copied`, { tone: 'success' });
      } catch {
        toast('Could not copy. Select the text and copy it manually.', { tone: 'error' });
      }
    },
    [toast],
  );
}
