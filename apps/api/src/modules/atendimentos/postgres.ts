import type { Recorte } from '@hq-crion/contracts/recorte';
import type { Pool } from 'pg';
import {
  aplicarConsultaDaListagem,
  aplicarConsultaDoDashboard,
  aplicarConsultaDaManutencao
} from './consulta.js';
import { periodoDaQuery, type ModoDaListagem } from './filtros.js';
import type { PortaDeAtendimentos } from './porta.js';
import type { RegistroDeAtendimento } from './registro.js';
import { schemaSql, selecionarPorRecorteSql, upsertAtendimentoSql, inserirAtendimentoSeAusenteSql } from './schema.js';
import { catalogoDeAtendimentos } from './catalogo.js';
import { deveSemear } from './semente.js';

export type ExecutorSql = Pick<Pool, 'query'>;

function cloneRegistro(registro: RegistroDeAtendimento): RegistroDeAtendimento {
  return structuredClone(registro);
}

function parametrosDoRegistro(registro: RegistroDeAtendimento) {
  return [
    registro.id,
    registro.administradora,
    registro.agenteId,
    registro.iniciadoEm,
    registro.concluidoEm ?? null,
    registro.motivo,
    registro.status,
    registro.duracaoEmSegundos ?? null,
    registro.transferencia ?? null,
    registro.tempoDeEsperaEmSegundos ?? null,
    registro.ferramentas ? JSON.stringify(registro.ferramentas) : null,
    JSON.stringify(registro.avaliacaoDaIa),
    registro.avaliacaoDoCurador ? JSON.stringify(registro.avaliacaoDoCurador) : null,
    JSON.stringify(registro)
  ];
}

export async function gravarAtendimento(
  cliente: ExecutorSql,
  registro: RegistroDeAtendimento
) {
  await cliente.query(upsertAtendimentoSql, parametrosDoRegistro(registro));
}

export async function inserirAtendimentoSeAusente(
  cliente: ExecutorSql,
  registro: RegistroDeAtendimento
) {
  await cliente.query(inserirAtendimentoSeAusenteSql, parametrosDoRegistro(registro));
}

export async function aplicarSchema(cliente: ExecutorSql) {
  await cliente.query(schemaSql);
}

export async function semearSeNecessario(
  cliente: ExecutorSql,
  skipSeed: boolean
) {
  const estado = await cliente.query<{ valor: string }>(
    `SELECT valor FROM hq_boot WHERE chave = 'seed'`
  );
  const jaSemeado = estado.rows[0]?.valor === 'ok';

  if (!deveSemear({ skipSeed, jaSemeado })) {
    return;
  }

  for (const registro of catalogoDeAtendimentos()) {
    await gravarAtendimento(cliente, registro);
  }

  await cliente.query(
    `INSERT INTO hq_boot (chave, valor) VALUES ('seed', 'ok')
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor`
  );
}

async function registrosDoRecorte(
  cliente: ExecutorSql,
  recorte: Recorte,
  query: Record<string, string | undefined>,
  modo: ModoDaListagem | 'dashboard' | 'manutencao'
) {
  const periodo = periodoDaQuery(query);
  const aplicarPeriodo = modo !== 'monitoramento';
  const eixoDoPeriodo = modo === 'fila' ? 'conclusao' : 'inicio';
  const resultado = await cliente.query<{ registro: RegistroDeAtendimento }>(
    selecionarPorRecorteSql,
    [
      recorte.administradora,
      recorte.agente,
      aplicarPeriodo,
      aplicarPeriodo ? periodo.inicio : '1970-01-01',
      aplicarPeriodo ? periodo.fim : '9999-12-31',
      eixoDoPeriodo
    ]
  );

  return resultado.rows.map((linha) => cloneRegistro(linha.registro));
}

export function repositorioPostgres(cliente: ExecutorSql): PortaDeAtendimentos {
  return {
    async listar() {
      const resultado = await cliente.query<{ registro: RegistroDeAtendimento }>(
        'SELECT registro FROM hq_atendimentos'
      );
      return resultado.rows.map((linha) => cloneRegistro(linha.registro));
    },
    async buscarPorId(id) {
      const resultado = await cliente.query<{ registro: RegistroDeAtendimento }>(
        'SELECT registro FROM hq_atendimentos WHERE id = $1',
        [id]
      );
      const registro = resultado.rows[0]?.registro;
      return registro ? cloneRegistro(registro) : undefined;
    },
    async salvar(registro) {
      await gravarAtendimento(cliente, registro);
    },
    async consultarListagem(recorte, query, modo, perfilId) {
      const registros = await registrosDoRecorte(cliente, recorte, query, modo);
      return aplicarConsultaDaListagem(registros, recorte, query, modo, perfilId);
    },
    async consultarDashboard(recorte, query) {
      const registros = await registrosDoRecorte(cliente, recorte, query, 'dashboard');
      return aplicarConsultaDoDashboard(registros, recorte, query);
    },
    async consultarManutencao(recorte, query) {
      const registros = await registrosDoRecorte(cliente, recorte, query, 'manutencao');
      return aplicarConsultaDaManutencao(registros, recorte, query);
    }
  };
}
