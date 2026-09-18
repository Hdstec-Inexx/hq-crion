import { motivosDeContato } from '@hq-crion/contracts/filtros-listagem';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { filtrarMotivosDeContato, motivoAceitoNoFiltro } from './motivo-combobox-logic';
import { useFecharAoClicarFora } from './useFecharAoClicarFora';

export function ComboboxMotivo({ valorSubmetido }: { valorSubmetido: string }) {
  const idBase = useId();
  const listboxId = `motivo-listbox-${idBase}`;
  const [valor, setValor] = useState(valorSubmetido);
  const [aberto, setAberto] = useState(false);
  const [destaque, setDestaque] = useState(-1);
  const raiz = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const opcoes = filtrarMotivosDeContato(motivosDeContato, valor);
  const motivoDoFormulario = motivoAceitoNoFiltro(valor, motivosDeContato);

  useEffect(() => {
    setValor(valorSubmetido);
  }, [valorSubmetido]);

  useFecharAoClicarFora(raiz, aberto, () => {
    setAberto(false);
    setDestaque(-1);
  });

  function escolher(opcao: string) {
    setValor(opcao);
    setAberto(false);
    setDestaque(-1);
    campo.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (opcoes.length === 0) {
        return;
      }
      setAberto(true);
      setDestaque((atual) => (atual < opcoes.length - 1 ? atual + 1 : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (opcoes.length === 0) {
        return;
      }
      setAberto(true);
      setDestaque((atual) => (atual > 0 ? atual - 1 : opcoes.length - 1));
    } else if (event.key === 'Enter' && aberto && destaque >= 0 && opcoes[destaque]) {
      event.preventDefault();
      escolher(opcoes[destaque]);
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      setAberto(false);
      setDestaque(-1);
    }
  }

  const idOpcaoAtiva =
    aberto && destaque >= 0 ? `motivo-opt-${idBase}-${destaque}` : undefined;

  return (
    <div className="listagem-combobox-motivo" ref={raiz}>
      <input type="hidden" name="motivo" value={motivoDoFormulario} />
      <label>
        Motivo
        <input
          ref={campo}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={aberto}
          aria-controls={listboxId}
          aria-activedescendant={idOpcaoAtiva}
          placeholder="Todos os motivos"
          value={valor}
          onChange={(event) => {
            setValor(event.target.value);
            setAberto(true);
            setDestaque(0);
          }}
          onFocus={() => setAberto(true)}
          onKeyDown={onKeyDown}
        />
      </label>
      {aberto && opcoes.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Motivo"
          className="listagem-combobox-motivo-lista"
        >
          {opcoes.map((opcao, indice) => (
            <li
              id={`motivo-opt-${idBase}-${indice}`}
              key={opcao}
              role="option"
              aria-selected={opcao === motivoDoFormulario}
              className={
                indice === destaque
                  ? 'listagem-combobox-motivo-opcao is-destaque'
                  : 'listagem-combobox-motivo-opcao'
              }
              onMouseDown={(event) => {
                event.preventDefault();
                escolher(opcao);
              }}
              onMouseEnter={() => setDestaque(indice)}
            >
              {opcao}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
