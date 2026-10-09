import type { FavoritosInfo } from '@hq-crion/contracts/atendimento';

export type BadgeFavoritosProps = {
  favoritos?: FavoritosInfo;
};

export function BadgeFavoritos({ favoritos }: BadgeFavoritosProps) {
  const count = favoritos?.count ?? 0;
  const nomes = (favoritos?.perfis ?? []).map((p) => p.nome).join(', ');
  const descricao =
    count > 0 ? `Favoritado por ${count} curador(es): ${nomes}` : 'Nenhum favorito registrado';

  return (
    <span
      className={`badge-favoritos${count > 0 ? ' is-ativo' : ' is-vazio'}`}
      title={descricao}
      aria-label={descricao}
      tabIndex={count > 0 ? 0 : undefined}
    >
      <span className="badge-favoritos-icone" aria-hidden="true">★</span>
      <span className="badge-favoritos-contagem">{count}</span>
      {count > 0 && nomes ? (
        <span className="badge-favoritos-tooltip" role="tooltip">
          {nomes}
        </span>
      ) : null}
    </span>
  );
}
