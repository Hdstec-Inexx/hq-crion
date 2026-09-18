import { notaIaDaQuery } from '@hq-crion/contracts/filtros-listagem';
import { useEffect, useState } from 'react';

function notaDoSlider(notaIaNaQuery: string) {
  return String(notaIaDaQuery(notaIaNaQuery) ?? 0);
}

export function SliderNotaDaIaAvaliadora({ notaIaNaQuery }: { notaIaNaQuery: string }) {
  const [valor, setValor] = useState(() => notaDoSlider(notaIaNaQuery));

  useEffect(() => {
    setValor(notaDoSlider(notaIaNaQuery));
  }, [notaIaNaQuery]);

  return (
    <label className="listagem-filtro-nota-ia">
      Nota da IA Avaliadora
      <input
        name="notaIa"
        type="range"
        min="0"
        max="10"
        step="0.5"
        value={valor}
        onChange={(event) => setValor(event.target.value)}
      />
      <output>{valor.replace('.', ',')}</output>
    </label>
  );
}
