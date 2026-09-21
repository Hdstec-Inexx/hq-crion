import { Link } from 'react-router-dom';

export function GraficoBarras({
  dados,
  destinoDaBarra,
  vazio
}: {
  dados: { nome: string; valor: number | null; frase: string }[];
  destinoDaBarra: (nome: string) => string;
  vazio: string;
}) {
  if (dados.length === 0) {
    return <p className="dashboard-vazio">{vazio}</p>;
  }

  return (
    <ul className="dashboard-barras">
      {dados.map((item) => {
        const preenchimento =
          item.valor === null ? 0 : Math.min(100, Math.max(0, item.valor));
        const rotulo =
          item.valor === null
            ? '—'
            : `${Number.isInteger(item.valor) ? String(item.valor) : item.valor.toFixed(1).replace('.', ',')}%`;

        return (
          <li key={item.nome}>
            <Link
              aria-label={`${item.nome} ${rotulo} ${item.frase}`}
              title={item.frase}
              to={destinoDaBarra(item.nome)}
            >
              <span className="dashboard-barra-rotulo">
                <span>{item.nome}</span>
                <strong>{rotulo}</strong>
              </span>
              <span className="dashboard-barra-trilho">
                <span style={{ width: `${preenchimento}%` }} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
