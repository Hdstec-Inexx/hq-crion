import { tituloDaPagina } from '@hq-crion/contracts/casca';
import {
  papelSchema,
  type ListaDePerfis,
  type Papel,
  type Perfil,
  type PerfilComId
} from '@hq-crion/contracts/perfil';
import { type FormEvent, useState } from 'react';
import {
  useLoaderData,
  useLocation,
  useRevalidator,
  useRouteLoaderData
} from 'react-router-dom';
import { lerSessao } from '../auth/sessao';
import { alterarPerfil, criarPerfil } from './api';

const papeis = papelSchema.options;

function mensagemDoMotivo(motivo: 'negado' | 'invalido' | 'conflito' | 'indisponivel') {
  if (motivo === 'negado') {
    return 'Só o Admin gere Perfis.';
  }

  if (motivo === 'invalido') {
    return 'Informe nome, e-mail válido e um dos três papéis.';
  }

  if (motivo === 'conflito') {
    return 'Já existe um Perfil com este e-mail.';
  }

  return 'Não foi possível salvar o Perfil.';
}

function identidadeDoFormulario(form: HTMLFormElement): Perfil {
  const data = new FormData(form);
  return {
    nome: String(data.get('nome') ?? ''),
    email: String(data.get('email') ?? ''),
    papel: String(data.get('papel') ?? '') as Papel
  };
}

function CampoPapel({ valor }: { valor?: Papel }) {
  return (
    <label className="login-field">
      Papel
      <select name="papel" defaultValue={valor ?? 'Curador'} required>
        {papeis.map((papel) => (
          <option key={papel} value={papel}>
            {papel}
          </option>
        ))}
      </select>
    </label>
  );
}

function CartaoPerfil({ perfil }: { perfil: PerfilComId }) {
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

    setErro(null);
    setEnviando(true);

    try {
      const resultado = await alterarPerfil(
        sessao,
        perfil.id,
        identidadeDoFormulario(event.currentTarget)
      );

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
    <form className="perfil-cartao" onSubmit={onSubmit} aria-label={perfil.nome}>
      <label className="login-field">
        Nome
        <input name="nome" type="text" defaultValue={perfil.nome} required />
      </label>
      <label className="login-field">
        E-mail
        <input name="email" type="text" defaultValue={perfil.email} required />
      </label>
      <CampoPapel valor={perfil.papel} />
      {erro ? (
        <p className="login-error" role="alert">
          {erro}
        </p>
      ) : null}
      <button className="perfil-salvar" type="submit" disabled={enviando}>
        Salvar
      </button>
    </form>
  );
}

export function PerfisPage() {
  const perfil = useRouteLoaderData('casca') as Perfil;
  const location = useLocation();
  const { perfis } = useLoaderData() as ListaDePerfis;
  const revalidator = useRevalidator();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onCriar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const sessao = lerSessao();

    if (!sessao) {
      setErro('A sessão expirou. Entre de novo.');
      return;
    }

    setErro(null);
    setEnviando(true);

    try {
      const resultado = await criarPerfil(sessao, identidadeDoFormulario(form));

      if (!resultado.ok) {
        setErro(mensagemDoMotivo(resultado.motivo));
        return;
      }

      form.reset();
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
        O Admin cria e altera a identidade (nome, e-mail) e o papel. Perfil não
        pertence a uma Administradora.
      </p>
      <form className="perfil-cartao perfil-novo" onSubmit={onCriar}>
        <h2>Novo Perfil</h2>
        <label className="login-field">
          Nome
          <input name="nome" type="text" required />
        </label>
        <label className="login-field">
          E-mail
          <input name="email" type="text" required />
        </label>
        <CampoPapel />
        {erro ? (
          <p className="login-error" role="alert">
            {erro}
          </p>
        ) : null}
        <button className="login-cta" type="submit" disabled={enviando}>
          Criar Perfil
        </button>
      </form>
      <section className="perfil-lista" aria-label="Perfis">
        {perfis.map((item) => (
          <CartaoPerfil
            key={`${item.id}:${item.nome}:${item.email}:${item.papel}`}
            perfil={item}
          />
        ))}
      </section>
    </div>
  );
}
