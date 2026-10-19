import { compactPageItems, type PageItem } from './compactPageItems.js';

export { compactPageItems, type PageItem };

export interface PaginacaoCompactaProps {
  pagina: number;
  totalPaginas: number;
  irPara: (pagina: number) => void;
}

export function PaginacaoCompacta({
  pagina,
  totalPaginas,
  irPara,
}: PaginacaoCompactaProps) {
  if (totalPaginas <= 1) {
    return null;
  }

  const items = compactPageItems(pagina, totalPaginas);

  return (
    <div className="listagem-paginacao" role="navigation" aria-label="Paginação">
      <button
        type="button"
        className="listagem-paginacao-prev"
        disabled={pagina <= 1}
        onClick={() => irPara(pagina - 1)}
      >
        Anterior
      </button>
      <div className="listagem-paginacao-itens">
        {items.map((item, index) =>
          item === 'ellipsis' ? (
            <span
              key={`ellipsis-${index}`}
              className="listagem-paginacao-elipse"
              aria-hidden="true"
            >
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className={`listagem-paginacao-item${item === pagina ? ' ativo' : ''}`}
              aria-current={item === pagina ? 'page' : undefined}
              onClick={() => irPara(item)}
            >
              {item}
            </button>
          )
        )}
      </div>
      <button
        type="button"
        className="listagem-paginacao-next"
        disabled={pagina >= totalPaginas}
        onClick={() => irPara(pagina + 1)}
      >
        Próxima
      </button>
    </div>
  );
}
