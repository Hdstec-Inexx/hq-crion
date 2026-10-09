import { useState } from 'react';
import { desfavoritarAtendimento, favoritarAtendimento } from './api';

export type BotaoFavoritoProps = {
  atendimentoId: string;
  favoritado: boolean;
  onToggle?: (novoEstado: boolean) => void;
  disabled?: boolean;
};

export function BotaoFavorito({
  atendimentoId,
  favoritado,
  onToggle,
  disabled = false
}: BotaoFavoritoProps) {
  const [carregando, setCarregando] = useState(false);

  async function alternar() {
    if (carregando || disabled) {
      return;
    }

    setCarregando(true);
    try {
      if (favoritado) {
        const resultado = await desfavoritarAtendimento(atendimentoId);
        if (resultado !== null) {
          onToggle?.(resultado);
        }
      } else {
        const resultado = await favoritarAtendimento(atendimentoId);
        if (resultado !== null) {
          onToggle?.(resultado);
        }
      }
    } finally {
      setCarregando(false);
    }
  }

  const rotulo = favoritado ? 'Remover dos favoritos' : 'Adicionar aos favoritos';

  return (
    <button
      type="button"
      className={`botao-favorito${favoritado ? ' is-favorito' : ''}${carregando ? ' is-carregando' : ''}`}
      onClick={() => void alternar()}
      disabled={disabled || carregando}
      aria-label={rotulo}
      aria-pressed={favoritado}
      title={rotulo}
    >
      <span className="estrela-icone" aria-hidden="true">
        {favoritado ? '★' : '☆'}
      </span>
      <span className="botao-favorito-texto">
        {favoritado ? 'Favoritado' : 'Favoritar'}
      </span>
    </button>
  );
}
