import { falaDoTexto, type TurnoDaTranscricao } from '@hq-crion/contracts/atendimento';
import { rotulosDoDetalhe, type DetalheDaFerramenta } from '@hq-crion/contracts/ferramenta';
import { useState, type MouseEvent } from 'react';

function copiarTexto(texto: string) {
  if (!navigator.clipboard) {
    return;
  }

  void navigator.clipboard.writeText(texto).catch(() => undefined);
}

function CampoJson({ rotulo, valor }: { rotulo: string; valor: string }) {
  const exibido = valor.trim() === '{}' ? '' : valor;

  return (
    <div className="ferramenta-bloco">
      <div className="ferramenta-bloco-topo">
        <span>{rotulo}</span>
        <button
          type="button"
          onClick={(evento) => {
            evento.stopPropagation();
            copiarTexto(exibido);
          }}
        >
          Copiar
        </button>
      </div>
      <pre>{exibido}</pre>
    </div>
  );
}

export function CartaoDaFerramenta({ detalhe }: { detalhe: DetalheDaFerramenta }) {
  const [aberto, setAberto] = useState(false);
  const rotulos = rotulosDoDetalhe(detalhe);

  function alternar(evento: MouseEvent<HTMLButtonElement>) {
    evento.stopPropagation();
    setAberto((atual) => !atual);
  }

  return (
    <div
      className="ferramenta-chamada"
      onClick={(evento) => {
        evento.stopPropagation();
      }}
    >
      <button
        type="button"
        className="ferramenta-linha"
        aria-expanded={aberto}
        onClick={alternar}
      >
        <span>{rotulos.linha}</span>
        <span>{aberto ? 'Recolher' : 'Expandir'}</span>
      </button>
      {aberto ? (
        <div className="ferramenta-painel">
          <h3>Detalhe da ferramenta</h3>
          {detalhe.tempoNoAtendimento || detalhe.tempoDoLlm || detalhe.tempoDeExecucao ? (
            <div className="ferramenta-tempos">
              {detalhe.tempoNoAtendimento ? <span>{detalhe.tempoNoAtendimento}</span> : null}
              {detalhe.tempoDoLlm ? <span>LLM {detalhe.tempoDoLlm}</span> : null}
              {detalhe.tempoDeExecucao ? <span>Ferramenta {detalhe.tempoDeExecucao}</span> : null}
            </div>
          ) : null}
          {rotulos.tipoDaFonte ? <p className="ferramenta-tipo">{rotulos.tipoDaFonte}</p> : null}
          {detalhe.veredito ? (
            <p className={`ferramenta-veredito is-${detalhe.veredito === 'Sucesso' ? 'sucesso' : 'falha'}`}>
              {detalhe.veredito}
            </p>
          ) : null}
          <dl>
            <div>
              <dt>{rotulos.nome}</dt>
              <dd>{detalhe.nome}</dd>
            </div>
            {rotulos.idExibido ? (
              <div>
                <dt>{rotulos.id}</dt>
                <dd>{rotulos.idExibido}</dd>
              </div>
            ) : null}
          </dl>
          {detalhe.raciocinio ? (
            <div className="ferramenta-bloco">
              <span>Raciocínio</span>
              <p>{detalhe.raciocinio}</p>
            </div>
          ) : null}
          {detalhe.parametros !== undefined ? (
            <CampoJson rotulo="Parâmetros extraídos pelo LLM" valor={detalhe.parametros} />
          ) : null}
          {detalhe.tempoDeExecucao ? (
            <p className="ferramenta-tempo">Tempo de execução da ferramenta: {detalhe.tempoDeExecucao}</p>
          ) : null}
          {detalhe.resposta !== undefined ? (
            <CampoJson rotulo="Resposta" valor={detalhe.resposta} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function CorpoDoTurno({ turno }: { turno: TurnoDaTranscricao }) {
  const fala = turno.detalhes?.length ? falaDoTexto(turno.texto) : turno.texto;

  return (
    <>
      {fala ? <p>{fala}</p> : null}
      {turno.detalhes?.map((detalhe, indice) => (
        <CartaoDaFerramenta key={`${detalhe.id ?? detalhe.nomeDaFerramenta}-${indice}`} detalhe={detalhe} />
      ))}
    </>
  );
}
