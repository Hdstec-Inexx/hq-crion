import { Link } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { coresDoAnel, fatiasVisiveisDoAnel } from './coresDoAnel';
import { DestinoDoGrafico } from './DestinoDoGrafico';
import type { PontoDoPainel } from './ponto-do-painel';

export function GraficoAnel({
  dados,
  destino,
  deslocamento,
  rotulo,
  vazio,
  reduzirMovimento
}: {
  dados: PontoDoPainel[];
  destino: string;
  deslocamento: number;
  rotulo: string;
  vazio: string;
  reduzirMovimento: boolean;
}) {
  const fatias = fatiasVisiveisDoAnel(dados);

  if (fatias.length === 0) {
    return <p className="dashboard-vazio">{vazio}</p>;
  }

  const cores = coresDoAnel(dados.length, deslocamento);
  const indiceDaFatia = new Map(dados.map((item, indice) => [item.nome, indice]));
  const total = fatias.reduce((soma, item) => soma + item.valor, 0);

  return (
    <div className="dashboard-anel">
      <DestinoDoGrafico className="dashboard-anel-frame" destino={destino} rotulo={rotulo}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={fatias}
              dataKey="valor"
              innerRadius="58%"
              isAnimationActive={!reduzirMovimento}
              nameKey="nome"
              outerRadius="100%"
              stroke="none"
            >
              {fatias.map((item) => (
                <Cell fill={cores[indiceDaFatia.get(item.nome) ?? 0]} key={item.nome} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </DestinoDoGrafico>
      <ul className="dashboard-anel-legenda">
        {fatias.map((item) => {
          const indice = indiceDaFatia.get(item.nome) ?? 0;
          const parcela = total === 0 ? 0 : (item.valor / total) * 100;
          return (
            <li key={item.nome}>
              <Link to={destino}>
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
