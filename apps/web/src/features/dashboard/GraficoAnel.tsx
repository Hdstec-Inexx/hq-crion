import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Cell, Pie, PieChart, Sector } from 'recharts';
import { coresDoAnel, fatiasVisiveisDoAnel, fraseDaFatia } from './coresDoAnel';
import { DestinoDoGrafico } from './DestinoDoGrafico';
import type { PontoDoPainel } from './ponto-do-painel';

const tamanhoDoAnel = 160;
const raioExterno = 78;
const raioInterno = Math.round(raioExterno * 0.58);

function participacaoDaFatia(valor: number, total: number) {
  return total === 0 ? 0 : (valor / total) * 100;
}

function fraseDoPonto(item: PontoDoPainel, total: number) {
  return fraseDaFatia(item.nome, item.valor, participacaoDaFatia(item.valor, total));
}

export function GraficoAnel({
  dados,
  destino,
  destinoDaFatia,
  deslocamento,
  rotulo,
  vazio,
  reduzirMovimento
}: {
  dados: PontoDoPainel[];
  destino: string;
  destinoDaFatia?: (nome: string) => string;
  deslocamento: number;
  rotulo: string;
  vazio: string;
  reduzirMovimento: boolean;
}) {
  const navigate = useNavigate();
  const [fatiaEmDestaque, setFatiaEmDestaque] = useState<string | null>(null);
  const fatias = fatiasVisiveisDoAnel(dados);

  if (fatias.length === 0) {
    return <p className="dashboard-vazio">{vazio}</p>;
  }

  const cores = coresDoAnel(fatias.length, deslocamento);
  const total = fatias.reduce((soma, item) => soma + item.valor, 0);
  const itemEmDestaque = fatias.find((item) => item.nome === fatiaEmDestaque);
  const irAFatia = (nome: string) => {
    navigate(destinoDaFatia ? destinoDaFatia(nome) : destino);
  };

  return (
    <div className="dashboard-anel">
      <DestinoDoGrafico className="dashboard-anel-frame" destino={destino} rotulo={rotulo}>
        <PieChart height={tamanhoDoAnel} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} width={tamanhoDoAnel}>
          <Pie
            cx={tamanhoDoAnel / 2}
            cy={tamanhoDoAnel / 2}
            data={fatias}
            dataKey="valor"
            innerRadius={raioInterno}
            isAnimationActive={!reduzirMovimento}
            nameKey="nome"
            outerRadius={raioExterno}
            shape={(props) => {
              const item = fatias.find((fatia) => fatia.nome === String(props.name));
              if (!item) {
                return <Sector {...props} />;
              }
              const frase = fraseDoPonto(item, total);
              return (
                <Sector
                  {...props}
                  aria-label={frase}
                  cursor="pointer"
                  onBlur={() => setFatiaEmDestaque(null)}
                  onClick={(evento) => evento.stopPropagation()}
                  onFocus={() => setFatiaEmDestaque(item.nome)}
                  onKeyDown={(evento) => {
                    if (evento.key === 'Enter' || evento.key === ' ') {
                      evento.preventDefault();
                      evento.stopPropagation();
                      irAFatia(item.nome);
                    }
                  }}
                  onMouseEnter={() => setFatiaEmDestaque(item.nome)}
                  onMouseLeave={() => setFatiaEmDestaque(null)}
                  onPointerUp={(evento) => {
                    evento.stopPropagation();
                    if (evento.pointerType === 'mouse' && evento.button !== 0) {
                      return;
                    }
                    irAFatia(item.nome);
                  }}
                  role="link"
                  tabIndex={0}
                />
              );
            }}
            stroke="#fff"
            strokeWidth={1}
          >
            {fatias.map((item, indice) => (
              <Cell fill={cores[indice]} key={item.nome} />
            ))}
          </Pie>
        </PieChart>
        {itemEmDestaque ? (
          <span className="dashboard-anel-frase" role="tooltip">
            {fraseDoPonto(itemEmDestaque, total)}
          </span>
        ) : null}
      </DestinoDoGrafico>
      <ul className="dashboard-anel-legenda">
        {fatias.map((item, indice) => {
          const participacao = participacaoDaFatia(item.valor, total);
          return (
            <li
              className={fatiaEmDestaque === item.nome ? 'dashboard-anel-legenda-destaque' : undefined}
              key={item.nome}
            >
              <Link to={destinoDaFatia ? destinoDaFatia(item.nome) : destino}>
                <span
                  className="dashboard-anel-swatch"
                  style={{ background: cores[indice] }}
                />
                <span>{item.nome}</span>
                <strong>
                  {item.valor.toLocaleString('pt-BR')} ({participacao.toFixed(0)}%)
                </strong>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
