import { tituloDaPagina } from '@hq-crion/contracts/casca';
import type { Perfil } from '@hq-crion/contracts/perfil';
import type { ReguaDeAvaliacao } from '@hq-crion/contracts/regua';
import { useLoaderData, useLocation, useRouteLoaderData } from 'react-router-dom';

function formatarValor(valor: number) {
  return valor.toFixed(1).replace('.', ',');
}

function formatarSoma(valor: number) {
  return Number.isInteger(valor) ? String(valor) : formatarValor(valor);
}

export function ReguaPage() {
  const perfil = useRouteLoaderData('casca') as Perfil;
  const location = useLocation();
  const regua = useLoaderData() as ReguaDeAvaliacao;
  const soma = regua.criterios.reduce((total, criterio) => total + criterio.valor, 0);

  return (
    <div>
      <div className="pagina-head">
        <h1>{tituloDaPagina(location.pathname, perfil.papel)}</h1>
      </div>
      <p className="regua-resumo">
        Uma Régua para todas as Claras. Soma {formatarSoma(soma)}. Aprovação ≥{' '}
        {formatarValor(regua.limiarDeAprovacao)}.
      </p>
      <section className="regua-painel" aria-label="Critérios da Régua de Avaliação">
        {regua.criterios.map((criterio) => (
          <article key={criterio.nome} className="regua-criterio">
            <div>
              <h2>{criterio.nome}</h2>
              {criterio.critico ? <span className="regua-critico">Crítico</span> : null}
            </div>
            <strong>{formatarValor(criterio.valor)}</strong>
          </article>
        ))}
      </section>
    </div>
  );
}
