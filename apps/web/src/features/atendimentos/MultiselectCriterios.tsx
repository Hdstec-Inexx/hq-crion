import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import {
  criteriosDaQuery,
  rotuloDosCriteriosSelecionados
} from './criterios-filtro-logic';
import { useFecharAoClicarFora } from './useFecharAoClicarFora';

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
  const idBase = useId();
  const listboxId = `criterios-lista-${idBase}`;
  const raiz = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const [selecionados, setSelecionados] = useState(() => criteriosDaQuery(submetido));

  useEffect(() => {
    const daQuery = criteriosDaQuery(submetido);
    setSelecionados(
      opcoes.length === 0 ? daQuery : daQuery.filter((nome) => opcoes.includes(nome))
    );
  }, [submetido, opcoes]);

  useFecharAoClicarFora(raiz, aberto, () => setAberto(false));

  function alternar(nome: string) {
    setSelecionados((atual) =>
      atual.includes(nome) ? atual.filter((item) => item !== nome) : [...atual, nome]
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      setAberto(false);
    }
  }

  return (
    <div className="listagem-multiselect-criterios" ref={raiz} onKeyDown={onKeyDown}>
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
                <span className="listagem-multiselect-criterios-opcao-texto">{nome}</span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
