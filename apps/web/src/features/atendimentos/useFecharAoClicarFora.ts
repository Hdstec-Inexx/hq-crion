import { type RefObject, useEffect, useRef } from 'react';

export function useFecharAoClicarFora(
  raiz: RefObject<HTMLElement | null>,
  aberto: boolean,
  onFechar: () => void
) {
  const onFecharRef = useRef(onFechar);
  onFecharRef.current = onFechar;

  useEffect(() => {
    if (!aberto) {
      return;
    }

    function fecharFora(event: MouseEvent) {
      if (raiz.current && !raiz.current.contains(event.target as Node)) {
        onFecharRef.current();
      }
    }

    document.addEventListener('mousedown', fecharFora);
    return () => document.removeEventListener('mousedown', fecharFora);
  }, [aberto, raiz]);
}
