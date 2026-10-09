import type { FavoritosInfo } from '@hq-crion/contracts/atendimento';

export type BadgeFavoritosProps = {
  favoritos?: FavoritosInfo;
  count?: number;
  perfis?: string[];
};

export function BadgeFavoritos({
  favoritos,
  count: countProp,
  perfis: perfisProp
}: BadgeFavoritosProps) {
  const count = countProp !== undefined ? countProp : (favoritos?.count ?? 0);
  const nomes =
    perfisProp !== undefined
      ? perfisProp.join(', ')
      : (favoritos?.perfis ?? []).map((p) => p.nome).join(', ');
  const descricao =
    count > 0 ? `Favoritado por ${count} curador(es): ${nomes}` : 'Nenhum favorito registrado';

  return (
    <span
      className={`badge-favoritos${count > 0 ? ' is-ativo' : ' is-vazio'}`}
      title={descricao}
      aria-label={descricao}
      tabIndex={0}
    >
      <span className="badge-favoritos-icone" aria-hidden="true">★</span>
      <span className="badge-favoritos-contagem">{count}</span>
      <span className="badge-favoritos-tooltip" role="tooltip">
        {count > 0 && nomes ? nomes : 'Nenhum favorito registrado'}
      </span>
    </span>
  );
}
