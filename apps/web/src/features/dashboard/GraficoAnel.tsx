import { Link } from 'react-router-dom';
import { Cell, Pie, PieChart } from 'recharts';
import { coresDoAnel, fatiasVisiveisDoAnel } from './coresDoAnel';
import { DestinoDoGrafico } from './DestinoDoGrafico';
import type { PontoDoPainel } from './ponto-do-painel';

const tamanhoDoAnel = 160;
const raioExterno = 78;
const raioInterno = Math.round(raioExterno * 0.58);

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
  const fatias = fatiasVisiveisDoAnel(dados);

  if (fatias.length === 0) {
    return <p className="dashboard-vazio">{vazio}</p>;
  }

  const cores = coresDoAnel(fatias.length, deslocamento);
  const total = fatias.reduce((soma, item) => soma + item.valor, 0);

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
            stroke="#fff"
            strokeWidth={1}
          >
            {fatias.map((item, indice) => (
              <Cell fill={cores[indice]} key={item.nome} />
            ))}
          </Pie>
        </PieChart>
      </DestinoDoGrafico>
      <ul className="dashboard-anel-legenda">
        {fatias.map((item, indice) => {
          const parcela = total === 0 ? 0 : (item.valor / total) * 100;
          return (
            <li key={item.nome}>
              <Link to={destinoDaFatia ? destinoDaFatia(item.nome) : destino}>
                <span
                  className="dashboard-anel-swatch"
                  style={{ background: cores[indice] }}
                />
                <span>{item.nome}</span>
                <strong>
                  {item.valor.toLocaleString('pt-BR')} ({parcela.toFixed(0)}%)
                </strong>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
