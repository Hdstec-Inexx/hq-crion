import type { ReactNode } from 'react';

const iconePadrao = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 6h16M4 12h16M4 18h10" />
  </svg>
);

const iconeCuradoriaFeita = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

const icones: Record<string, ReactNode> = {
  '/dashboard': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  ),
  '/atendimentos': iconePadrao,
  '/monitoramento': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 5v2M12 17v2M5 12H3M21 12h-2" />
    </svg>
  ),
  '/fila-de-curadoria': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  ),
  '/minhas-curadorias': iconeCuradoriaFeita,
  '/curadorias-realizadas': iconeCuradoriaFeita,
  '/manutencao': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 7l3 3-8 8H6v-3l8-8z" />
    </svg>
  ),
  '/usuarios': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20v-1a6 6 0 0 1 12 0v1" />
      <circle cx="17" cy="9" r="2" />
      <path d="M21 20v-1a4 4 0 0 0-3-3.87" />
    </svg>
  ),
  '/ia-avaliadora': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8M12 8v8" />
    </svg>
  ),
  '/regua': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 20L20 4" />
      <path d="M9 20h.01M13 16h.01M17 12h.01" />
    </svg>
  )
};

export function iconeDaArea(rota: string) {
  return icones[rota] ?? iconePadrao;
}
