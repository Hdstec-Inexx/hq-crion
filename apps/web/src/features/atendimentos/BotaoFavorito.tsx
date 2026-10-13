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
  const [erro, setErro] = useState(false);

  async function alternar() {
    if (carregando || disabled) {
      return;
    }

    setCarregando(true);
    setErro(false);
    try {
      const acao = favoritado ? desfavoritarAtendimento : favoritarAtendimento;
      const resultado = await acao(atendimentoId);
      if (resultado !== null) {
        onToggle?.(resultado);
      }
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }

  const rotulo = erro
    ? 'Erro ao atualizar favorito. Tente novamente.'
    : disabled
      ? 'Aguardando persistência do atendimento no HQ para favoritar'
      : favoritado
        ? 'Remover dos favoritos'
        : 'Adicionar aos favoritos';

  return (
    <button
      type="button"
      className={`botao-favorito${favoritado ? ' is-favorito' : ''}${carregando ? ' is-carregando' : ''}${erro ? ' is-erro' : ''}`}
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
