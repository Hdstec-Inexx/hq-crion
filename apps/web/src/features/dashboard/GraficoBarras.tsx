import { useState } from 'react';
import { Link } from 'react-router-dom';

function BarraDoPainel({
  item,
  destino
}: {
  item: { nome: string; valor: number | null; fraseDoHover: string };
  destino: string;
}) {
  const [visivel, setVisivel] = useState(false);
  const preenchimento =
    item.valor === null ? 0 : Math.min(100, Math.max(0, item.valor));
  const rotulo =
    item.valor === null
      ? '—'
      : `${Number.isInteger(item.valor) ? String(item.valor) : item.valor.toFixed(1).replace('.', ',')}%`;

  return (
    <li>
      <Link
        aria-label={`${item.nome} ${rotulo} ${item.fraseDoHover}`}
        onBlur={() => setVisivel(false)}
        onFocus={() => setVisivel(true)}
        onPointerEnter={(evento) => {
          if (evento.pointerType === 'mouse') {
            setVisivel(true);
          }
        }}
        onPointerLeave={() => setVisivel(false)}
        to={destino}
      >
        <span className="dashboard-barra-rotulo">
          <span>{item.nome}</span>
          <strong>{rotulo}</strong>
        </span>
        <span hidden={!visivel}>{item.fraseDoHover}</span>
        <span className="dashboard-barra-trilho">
          <span style={{ width: `${preenchimento}%` }} />
        </span>
      </Link>
    </li>
  );
}

export function GraficoBarras({
  dados,
  destinoDaBarra,
  vazio
}: {
  dados: { nome: string; valor: number | null; fraseDoHover: string }[];
  destinoDaBarra: (nome: string) => string;
  vazio: string;
}) {
  if (dados.length === 0) {
    return <p className="dashboard-vazio">{vazio}</p>;
  }

  return (
    <ul className="dashboard-barras">
      {dados.map((item) => (
        <BarraDoPainel
          key={item.nome}
          destino={destinoDaBarra(item.nome)}
          item={item}
        />
      ))}
    </ul>
  );
}
