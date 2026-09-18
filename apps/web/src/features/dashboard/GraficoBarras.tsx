import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DestinoDoGrafico } from './DestinoDoGrafico';
import type { PontoDoPainel } from './ponto-do-painel';

export function GraficoBarras({
  dados,
  destino,
  reduzirMovimento
}: {
  dados: PontoDoPainel[];
  destino: string;
  reduzirMovimento: boolean;
}) {
  if (dados.length === 0) {
    return <p>—</p>;
  }

  return (
    <DestinoDoGrafico className="dashboard-grafico" destino={destino}>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={dados} layout="vertical" margin={{ left: 8, right: 8 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="nome" width={110} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar
            dataKey="valor"
            fill="#5ec4be"
            isAnimationActive={!reduzirMovimento}
            radius={[0, 6, 6, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </DestinoDoGrafico>
  );
}
