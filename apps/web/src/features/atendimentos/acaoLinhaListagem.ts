import { useNavigate } from 'react-router-dom';

function resolverElementoAlvo(alvo: unknown): { closest?: (selector: string) => unknown } | null {
  if (!alvo || typeof alvo !== 'object') {
    return null;
  }

  const elemento = alvo as {
    closest?: (selector: string) => unknown;
    parentElement?: { closest?: (selector: string) => unknown };
  };

  if (typeof elemento.closest === 'function') {
    return elemento;
  }

  if (elemento.parentElement && typeof elemento.parentElement.closest === 'function') {
    return elemento.parentElement;
  }

  return null;
}

export function deveAbrirAtendimentoPeloClique(
  alvo: unknown,
  temSelecaoTexto: boolean
): boolean {
  if (temSelecaoTexto) {
    return false;
  }

  const elemento = resolverElementoAlvo(alvo);
  if (!elemento || typeof elemento.closest !== 'function') {
    return true;
  }

  // Se o clique foi disparado em um link ou botão (ex: badge da Administradora, botão Favorito,
  // botão Marcar Resolvido ou link principal), a linha não deve disparar navegação conflitante.
  if (elemento.closest('a, button')) {
    return false;
  }

  return true;
}

export function deveAbrirAtendimentoPeloTeclado(event: {
  key: string;
  target?: unknown;
  currentTarget?: unknown;
}): boolean {
  if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
    return false;
  }

  const elementoAlvo = resolverElementoAlvo(event.target);
  const elementoContainer = resolverElementoAlvo(event.currentTarget);

  // Se o foco está em um elemento interativo interno da linha (ex: badge, link, botão de ação
  // ou outro elemento focável com tabindex), a linha não intercepta o evento do teclado.
  if (elementoAlvo && elementoContainer && elementoAlvo !== elementoContainer) {
    if (
      typeof elementoAlvo.closest === 'function' &&
      elementoAlvo.closest('a, button, [tabindex="0"]')
    ) {
      return false;
    }
  }

  return true;
}

export function useNavegacaoLinha() {
  return useNavigate();
}
