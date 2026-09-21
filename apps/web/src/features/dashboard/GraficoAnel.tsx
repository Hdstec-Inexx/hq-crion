import { useCallback, useMemo, useState } from 'react';
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
  const [fatiaEmDestaque, setFatiaEmDestaque] = useState<PontoDoPainel | null>(null);
  const fatias = useMemo(() => fatiasVisiveisDoAnel(dados), [dados]);
  const fatiaPorNome = useMemo(
    () => new Map(fatias.map((item) => [item.nome, item])),
    [fatias]
  );
  const destinoDaLinha = useCallback(
    (nome: string) => (destinoDaFatia ? destinoDaFatia(nome) : destino),
    [destino, destinoDaFatia]
  );
  const irAFatia = useCallback(
    (nome: string) => {
      navigate(destinoDaLinha(nome));
    },
    [destinoDaLinha, navigate]
  );
  const destacar = useCallback((item: PontoDoPainel) => setFatiaEmDestaque(item), []);
  const limparDestaque = useCallback(() => setFatiaEmDestaque(null), []);

  if (fatias.length === 0) {
    return <p className="dashboard-vazio">{vazio}</p>;
  }

  const cores = coresDoAnel(fatias.length, deslocamento);
  const total = fatias.reduce((soma, item) => soma + item.valor, 0);

  return (
    <div className="dashboard-anel">
      <DestinoDoGrafico
        className="dashboard-anel-frame"
        destino={destino}
        rotulo={rotulo}
        tamanhoDoMiolo={2 * raioInterno - 8}
      >
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
              const item = fatiaPorNome.get(String(props.name));
              if (!item) {
                return <Sector {...props} />;
              }
              return (
                <Sector
                  {...props}
                  cursor="pointer"
                  onClick={(evento) => {
                    evento.stopPropagation();
                    irAFatia(item.nome);
                  }}
                  onPointerDown={(evento) => evento.stopPropagation()}
                  onPointerEnter={(evento) => {
                    if (evento.pointerType === 'touch') {
                      return;
                    }
                    destacar(item);
                  }}
                  onPointerLeave={(evento) => {
                    if (evento.pointerType === 'touch') {
                      return;
                    }
                    limparDestaque();
                  }}
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
        {fatias.map((item) => (
          <Link
            aria-label={fraseDoPonto(item, total)}
            className="dashboard-anel-fatia-teclado"
            key={item.nome}
            onBlur={limparDestaque}
            onClick={(evento) => evento.stopPropagation()}
            onFocus={() => destacar(item)}
            onKeyDown={(evento) => {
              if (evento.key === 'Enter' || evento.key === ' ') {
                evento.preventDefault();
                evento.stopPropagation();
                irAFatia(item.nome);
              }
            }}
            to={destinoDaLinha(item.nome)}
          >
            {fraseDoPonto(item, total)}
          </Link>
        ))}
        {fatiaEmDestaque ? (
          <span className="dashboard-anel-frase" role="tooltip">
            {fraseDoPonto(fatiaEmDestaque, total)}
          </span>
        ) : null}
      </DestinoDoGrafico>
      <ul className="dashboard-anel-legenda">
        {fatias.map((item, indice) => {
          const participacao = participacaoDaFatia(item.valor, total);
          return (
            <li
              className={fatiaEmDestaque?.nome === item.nome ? 'dashboard-anel-legenda-destaque' : undefined}
              key={item.nome}
            >
              <Link to={destinoDaLinha(item.nome)}>
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
