import { notaIaDaQuery } from '@hq-crion/contracts/filtros-listagem';
import { useEffect, useState } from 'react';

function valorDoSlider(submetido: string) {
  return String(notaIaDaQuery(submetido) ?? 0);
}

export function SliderNotaDaIaAvaliadora({ submetido }: { submetido: string }) {
  const [valor, setValor] = useState(() => valorDoSlider(submetido));

  useEffect(() => {
    setValor(valorDoSlider(submetido));
  }, [submetido]);

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
        aria-label="Nota da IA Avaliadora"
      />
      <output>{valor.replace('.', ',')}</output>
    </label>
  );
}
