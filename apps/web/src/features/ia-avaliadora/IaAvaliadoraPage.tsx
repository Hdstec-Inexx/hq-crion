import { tituloDaPagina } from '@hq-crion/contracts/casca';
import type { ConfiguracaoDaIaAvaliadora } from '@hq-crion/contracts/ia-avaliadora';
import type { Perfil } from '@hq-crion/contracts/perfil';
import { type FormEvent, useState } from 'react';
import {
  useLoaderData,
  useLocation,
  useRevalidator,
  useRouteLoaderData
} from 'react-router-dom';
import { lerSessao } from '../auth/sessao';
import { gravarIaAvaliadora } from './api';

function mensagemDoMotivo(
  motivo: 'sessao' | 'negado' | 'invalido' | 'indisponivel'
) {
  if (motivo === 'sessao') {
    return 'A sessão expirou. Entre de novo.';
  }

  if (motivo === 'negado') {
    return 'Só o Admin configura a IA Avaliadora.';
  }

  if (motivo === 'invalido') {
    return 'Informe prompt, modelo e temperatura entre 0 e 2.';
  }

  return 'Não foi possível gravar a IA Avaliadora.';
}

export function IaAvaliadoraPage() {
  const perfil = useRouteLoaderData('casca') as Perfil;
  const location = useLocation();
  const configuracao = useLoaderData() as ConfiguracaoDaIaAvaliadora;
  const revalidator = useRevalidator();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sessao = lerSessao();

    if (!sessao) {
      setErro('A sessão expirou. Entre de novo.');
      return;
    }

    const data = new FormData(event.currentTarget);
    setErro(null);
    setEnviando(true);

    try {
      const resultado = await gravarIaAvaliadora(sessao, {
        prompt: String(data.get('prompt') ?? ''),
        modelo: String(data.get('modelo') ?? ''),
        temperatura: Number(data.get('temperatura'))
      });

      if (!resultado.ok) {
        setErro(mensagemDoMotivo(resultado.motivo));
        return;
      }

      await revalidator.revalidate();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <div className="pagina-head">
        <h1>{tituloDaPagina(location.pathname, perfil.papel)}</h1>
      </div>
      <p className="regua-resumo">
        Uma IA Avaliadora para todas as Claras. Prompt, modelo e temperatura
        únicos — o Dashboard consolidado continua comparável.
      </p>
      <form className="perfil-cartao ia-avaliadora-form" onSubmit={onSubmit}>
        <label className="login-field">
          Prompt
          <textarea
            name="prompt"
            defaultValue={configuracao.prompt}
            required
            rows={8}
            maxLength={20_000}
          />
        </label>
        <label className="login-field">
          Modelo
          <input
            name="modelo"
            type="text"
            defaultValue={configuracao.modelo}
            required
            maxLength={200}
          />
        </label>
        <label className="login-field">
          Temperatura
          <input
            name="temperatura"
            type="number"
            defaultValue={configuracao.temperatura}
            min={0}
            max={2}
            step={0.1}
            required
          />
        </label>
        {erro ? (
          <p className="login-error" role="alert">
            {erro}
          </p>
        ) : null}
        <button className="perfil-salvar" type="submit" disabled={enviando}>
          Salvar
        </button>
      </form>
    </div>
  );
}
