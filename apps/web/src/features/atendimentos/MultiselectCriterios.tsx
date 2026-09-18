import { useEffect, useId, useRef, useState } from 'react';
import {
  criteriosDaQuery,
  rotuloDosCriteriosSelecionados
} from './criterios-filtro-logic';

export function MultiselectCriterios({
  name,
  rotulo,
  submetido,
  opcoes
}: {
  name: 'criteriosAtendidos' | 'criteriosNaoAtendidos';
  rotulo: string;
  submetido: string;
  opcoes: string[];
}) {
  const gerado = useId();
  const listboxId = `criterios-lista-${gerado}`;
  const caixa = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const [selecionados, setSelecionados] = useState(() => criteriosDaQuery(submetido));

  useEffect(() => {
    setSelecionados(criteriosDaQuery(submetido));
  }, [submetido]);

  useEffect(() => {
    function fecharFora(event: MouseEvent) {
      if (caixa.current && !caixa.current.contains(event.target as Node)) {
        setAberto(false);
      }
    }

    document.addEventListener('mousedown', fecharFora);
    return () => document.removeEventListener('mousedown', fecharFora);
  }, []);

  function alternar(nome: string) {
    setSelecionados((atual) =>
      atual.includes(nome) ? atual.filter((item) => item !== nome) : [...atual, nome]
    );
  }

  return (
    <div className="listagem-multiselect-criterios" ref={caixa}>
      {selecionados.map((nome) => (
        <input key={nome} type="hidden" name={name} value={nome} />
      ))}
      <span className="listagem-multiselect-criterios-rotulo">{rotulo}</span>
      <button
        type="button"
        className="listagem-multiselect-criterios-gatilho"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={listboxId}
        onClick={() => setAberto((atual) => !atual)}
      >
        {rotuloDosCriteriosSelecionados(selecionados)}
      </button>
      {aberto ? (
        <div
          id={listboxId}
          className="listagem-multiselect-criterios-painel"
          role="listbox"
          aria-multiselectable="true"
          aria-label={rotulo}
        >
          <div className="listagem-multiselect-criterios-acoes">
            <button
              type="button"
              onClick={() => {
                if (opcoes.length > 0) {
                  setSelecionados([...opcoes]);
                }
              }}
              disabled={opcoes.length === 0}
            >
              Selecionar todos
            </button>
            <button type="button" onClick={() => setSelecionados([])} disabled={selecionados.length === 0}>
              Limpar
            </button>
          </div>
          {opcoes.map((nome) => {
            const marcado = selecionados.includes(nome);

            return (
              <label key={nome} className="listagem-multiselect-criterios-opcao">
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() => alternar(nome)}
                />
                {nome}
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
