import { randomUUID } from 'node:crypto';
import type { CriterioAvaliado } from '@hq-crion/contracts/atendimento';
import type { Recorte } from '@hq-crion/contracts/recorte';
import {
  aplicarConsultaDaListagem,
  aplicarConsultaDaManutencao,
  aplicarConsultaDoDashboard,
  consultaDoPercurso
} from './consulta.js';
import { periodoDaQuery, type ModoDaListagem } from './filtros.js';
import type { PortaDeAtendimentos } from './porta.js';
import {
  aprovacaoDaNota,
  avaliacaoDaIaTemVeredito,
  camposDeMidia,
  criteriosComChave,
  recusaDaAvaliacao,
  recusaDaConferencia,
  type RegistroDeAtendimento
} from './registro.js';
import { inserirAtendimentoSeAusenteSql, inserirAtendimentoSql, schemaSql } from './schema.js';
import { catalogoDeAtendimentos } from './catalogo.js';
import { deveSemear } from './semente.js';

export type ExecutorSql = {
  query(
    texto: string,
    valores?: unknown[]
  ): Promise<{ rows: any[]; rowCount?: number | null }>;
};

type ConexaoSql = ExecutorSql & {
  release(): void;
};

export type PoolSql = ExecutorSql & {
  connect(): Promise<ConexaoSql>;
};

const leituraSql = `
SELECT
  a.id,
  a.agente_id,
  ag.nome AS agente,
  ag.administradora,
  a.status,
  a.iniciado_em,
  a.concluido_em,
  a.duracao_em_segundos,
  a.transcricao,
  a.audio,
  a.motivo,
  a.transferencia,
  a.custo,
  a.tempo_de_espera_em_segundos,
  a.ferramentas,
  ia.nota AS nota_ia,
  vig.id AS avaliacao_curador_id,
  vig.nota AS nota_curador,
  vig.nota_da_avaliacao_da_ia,
  vig.curador_id,
  vig.curador_nome,
  com.texto AS comentario_vigente,
  com.status AS comentario_status_vigente,
  EXISTS (
    SELECT 1 FROM hq_avaliacao_do_curador revisao
    WHERE revisao.atendimento_id = a.id
  ) AS tem_curadoria
FROM hq_atendimento a
JOIN hq_agente_de_voz ag ON ag.id = a.agente_id
LEFT JOIN hq_avaliacao_da_ia ia ON ia.atendimento_id = a.id
LEFT JOIN LATERAL (
  SELECT id, nota, nota_da_avaliacao_da_ia, curador_id, curador_nome
  FROM hq_avaliacao_do_curador revisao
  WHERE revisao.atendimento_id = a.id
  ORDER BY revisao.criada_em DESC, revisao.id DESC
  LIMIT 1
) vig ON true
LEFT JOIN hq_comentario com ON com.avaliacao_id = vig.id
WHERE ($7::text IS NULL OR a.id = $7)
  AND ($1::text IS NULL OR ag.administradora = $1)
  AND ($2::text IS NULL OR a.agente_id = $2)
  AND (
    $3::boolean = false
    OR (
      ((CASE
          WHEN $6::text = 'conclusao' THEN COALESCE(a.concluido_em, a.iniciado_em)
          ELSE a.iniciado_em
        END) AT TIME ZONE 'America/Sao_Paulo')::date >= $4::date
      AND ((CASE
          WHEN $6::text = 'conclusao' THEN COALESCE(a.concluido_em, a.iniciado_em)
          ELSE a.iniciado_em
        END) AT TIME ZONE 'America/Sao_Paulo')::date <= $5::date
    )
  )
`;

function formatarCusto(valor: unknown) {
  if (valor === null || valor === undefined || valor === '') {
    return undefined;
  }

  const numeroDoCusto = typeof valor === 'number' ? valor : Number(valor);

  if (!Number.isFinite(numeroDoCusto)) {
    return String(valor);
  }

  return `R$ ${numeroDoCusto.toFixed(2).replace('.', ',')}`;
}

function custoNumerico(valor: string | undefined) {
  if (!valor) {
    return 0;
  }

  const numeroDoCusto = Number(valor.replace(/[^\d,-]/g, '').replace(',', '.'));
  return Number.isFinite(numeroDoCusto) ? numeroDoCusto : 0;
}

function numero(valor: unknown) {
  return typeof valor === 'number' ? valor : Number(valor);
}

function iso(valor: unknown) {
  if (valor instanceof Date) {
    return valor.toISOString();
  }

  return new Date(String(valor)).toISOString();
}

function criterioDe(linha: {
  chave?: string;
  nome: string;
  estado: CriterioAvaliado['estado'];
  pontos: unknown;
  critico: boolean;
}): CriterioAvaliado {
  return {
    ...(linha.chave ? { chave: linha.chave } : {}),
    nome: linha.nome,
    estado: linha.estado,
    pontos: numero(linha.pontos),
    critico: linha.critico
  };
}

async function emTransacao<T>(pool: PoolSql, trabalho: (cliente: ExecutorSql) => Promise<T>) {
  const conexao = await pool.connect();

  try {
    await conexao.query('BEGIN');
    const resultado = await trabalho(conexao);
    await conexao.query('COMMIT');
    return resultado;
  } catch (error) {
    await conexao.query('ROLLBACK');
    throw error;
  } finally {
    conexao.release();
  }
}

async function mapaDeCriterios(
  cliente: ExecutorSql,
  sql: string,
  ids: string[],
  chave: 'atendimento_id' | 'avaliacao_id'
) {
  const mapa = new Map<string, CriterioAvaliado[]>();

  if (ids.length === 0) {
    return mapa;
  }

  const resultado = await cliente.query(sql, [ids]);

  for (const linha of resultado.rows as Array<{
    atendimento_id?: string;
    avaliacao_id?: string;
    chave?: string;
    nome: string;
    estado: CriterioAvaliado['estado'];
    pontos: unknown;
    critico: boolean;
  }>) {
    const id = linha[chave];

    if (!id) {
      continue;
    }

    const lista = mapa.get(id) ?? [];
    lista.push(criterioDe(linha));
    mapa.set(id, lista);
  }

  return mapa;
}

function montarRegistro(
  linha: {
    id: string;
    agente_id: string;
    agente: string;
    administradora: RegistroDeAtendimento['administradora'];
    status: string;
    iniciado_em: unknown;
    concluido_em: unknown;
    duracao_em_segundos: number | null;
    transcricao: RegistroDeAtendimento['transcricao'];
    audio: string | null;
    motivo: string;
    transferencia: boolean | null;
    custo: string | number | null;
    tempo_de_espera_em_segundos: number | null;
    ferramentas: RegistroDeAtendimento['ferramentas'] | null;
    nota_ia: unknown;
    avaliacao_curador_id: string | null;
    nota_curador: unknown;
    nota_da_avaliacao_da_ia: unknown;
    curador_id: string | null;
    curador_nome: string | null;
    comentario_vigente: string | null;
    comentario_status_vigente: 'Pendente' | 'Resolvido' | null;
    tem_curadoria: boolean;
  },
  criteriosIa: Map<string, CriterioAvaliado[]>,
  criteriosCurador: Map<string, CriterioAvaliado[]>
): RegistroDeAtendimento {
  const notaIa =
    linha.nota_ia === null || linha.nota_ia === undefined ? undefined : numero(linha.nota_ia);
  const avaliacaoDaIa =
    notaIa === undefined
      ? undefined
      : {
          nota: notaIa,
          aprovacao: aprovacaoDaNota(notaIa),
          criterios: criteriosIa.get(linha.id) ?? []
        };
  const notaCurador =
    linha.nota_curador === null || linha.nota_curador === undefined
      ? undefined
      : numero(linha.nota_curador);
  const avaliacaoDoCurador =
    linha.avaliacao_curador_id && notaCurador !== undefined && linha.curador_nome
      ? {
          nota: notaCurador,
          aprovacao: aprovacaoDaNota(notaCurador),
          criterios: criteriosCurador.get(linha.avaliacao_curador_id) ?? [],
          notaDaAvaliacaoDaIa: numero(linha.nota_da_avaliacao_da_ia),
          curador: linha.curador_nome,
          ...(linha.comentario_vigente ? { comentario: linha.comentario_vigente } : {})
        }
      : undefined;

  const custo = formatarCusto(linha.custo);

  return {
    id: linha.id,
    administradora: linha.administradora,
    agente: linha.agente,
    agenteId: linha.agente_id,
    iniciadoEm: iso(linha.iniciado_em),
    motivo: linha.motivo,
    nota: notaIa ?? 0,
    status: linha.status,
    curadoria: Boolean(linha.tem_curadoria),
    conversa: linha.id,
    ...(custo ? { custo } : {}),
    ...camposDeMidia(linha.audio),
    transcricao: linha.transcricao ?? [],
    ...(avaliacaoDaIa && avaliacaoDaIa.criterios.length > 0 ? { avaliacaoDaIa } : {}),
    ...(avaliacaoDoCurador && avaliacaoDoCurador.criterios.length > 0
      ? { avaliacaoDoCurador }
      : {}),
    ...(linha.curador_id && linha.curador_nome
      ? { curadorDaRevisao: { id: linha.curador_id, nome: linha.curador_nome } }
      : {}),
    ...(linha.concluido_em ? { concluidoEm: iso(linha.concluido_em) } : {}),
    ...(linha.comentario_status_vigente
      ? { comentarioStatus: linha.comentario_status_vigente }
      : {}),
    ...(linha.duracao_em_segundos !== null
      ? { duracaoEmSegundos: linha.duracao_em_segundos }
      : {}),
    transferencia: Boolean(linha.transferencia),
    ...(linha.tempo_de_espera_em_segundos !== null
      ? { tempoDeEsperaEmSegundos: linha.tempo_de_espera_em_segundos }
      : {}),
    ...(linha.ferramentas ? { ferramentas: linha.ferramentas } : {})
  };
}

async function lerRegistros(
  cliente: ExecutorSql,
  entrada: {
    id?: string;
    recorte?: Recorte;
    query?: Record<string, string | undefined>;
    modo?: ModoDaListagem | 'dashboard' | 'manutencao';
  }
) {
  const query = entrada.query ?? {};
  const periodo = periodoDaQuery(query);
  const modo = entrada.modo ?? 'todos';
  const aplicarPeriodo = entrada.id ? false : modo !== 'monitoramento';
  const recorte = entrada.recorte ?? { administradora: null, agente: null };
  const resultado = await cliente.query(leituraSql, [
    recorte.administradora,
    recorte.agente,
    aplicarPeriodo,
    aplicarPeriodo ? periodo.inicio : '1970-01-01',
    aplicarPeriodo ? periodo.fim : '9999-12-31',
    modo === 'fila' ? 'conclusao' : 'inicio',
    entrada.id ?? null
  ]);
  const linhas = resultado.rows as Parameters<typeof montarRegistro>[0][];
  const criteriosIa = await mapaDeCriterios(
    cliente,
    `SELECT atendimento_id, chave, nome, estado, pontos, critico
     FROM hq_criterio_da_avaliacao_da_ia
     WHERE atendimento_id = ANY($1::text[])
     ORDER BY ordem`,
    linhas.map((linha) => linha.id),
    'atendimento_id'
  );
  const criteriosCurador = await mapaDeCriterios(
    cliente,
    `SELECT avaliacao_id, chave, nome, estado, pontos, critico
     FROM hq_criterio_da_avaliacao_do_curador
     WHERE avaliacao_id = ANY($1::text[])
     ORDER BY ordem`,
    linhas.flatMap((linha) => (linha.avaliacao_curador_id ? [linha.avaliacao_curador_id] : [])),
    'avaliacao_id'
  );

  return linhas.map((linha) => montarRegistro(linha, criteriosIa, criteriosCurador));
}

function registroDoComentario(linha: {
  comentario_id: string;
  texto: string;
  status: 'Pendente' | 'Resolvido';
  id: string;
  agente_id: string;
  agente: string;
  administradora: RegistroDeAtendimento['administradora'];
  iniciado_em: unknown;
  motivo: string;
  status_atendimento: string;
  audio: string | null;
}): RegistroDeAtendimento {
  return {
    id: linha.id,
    comentarioId: linha.comentario_id,
    administradora: linha.administradora,
    agente: linha.agente,
    agenteId: linha.agente_id,
    iniciadoEm: iso(linha.iniciado_em),
    motivo: linha.motivo,
    nota: 0,
    status: linha.status_atendimento,
    curadoria: true,
    conversa: linha.id,
    ...camposDeMidia(linha.audio),
    transcricao: [],
    comentarioStatus: linha.status,
    avaliacaoDoCurador: {
      nota: 0,
      aprovacao: 'Reprovado',
      criterios: [
        {
          nome: 'Comentário',
          estado: 'Não se aplica',
          pontos: 1,
          critico: false
        }
      ],
      notaDaAvaliacaoDaIa: 0,
      curador: 'Curador',
      comentario: linha.texto
    }
  };
}

async function registrosDeComentario(
  cliente: ExecutorSql,
  comentarioId?: string,
  filtro?: {
    recorte: Recorte;
    query: Record<string, string | undefined>;
  }
) {
  const periodo = filtro ? periodoDaQuery(filtro.query) : undefined;
  const resultado = await cliente.query(
    `SELECT
       c.id AS comentario_id,
       c.texto,
       c.status,
       a.id,
       a.agente_id,
       ag.nome AS agente,
       ag.administradora,
       a.iniciado_em,
       a.motivo,
       a.status AS status_atendimento,
       a.audio
     FROM hq_comentario c
     JOIN hq_atendimento a ON a.id = c.atendimento_id
     JOIN hq_agente_de_voz ag ON ag.id = a.agente_id
     WHERE ($1::text IS NULL OR c.id = $1)
       AND ($2::text IS NULL OR ag.administradora = $2)
       AND ($3::text IS NULL OR a.agente_id = $3)
       AND (
         $4::boolean = false
         OR (
           (a.iniciado_em AT TIME ZONE 'America/Sao_Paulo')::date >= $5::date
           AND (a.iniciado_em AT TIME ZONE 'America/Sao_Paulo')::date <= $6::date
         )
       )`,
    [
      comentarioId ?? null,
      filtro?.recorte.administradora ?? null,
      filtro?.recorte.agente ?? null,
      Boolean(filtro),
      periodo?.inicio ?? '1970-01-01',
      periodo?.fim ?? '9999-12-31'
    ]
  );

  return (resultado.rows as Parameters<typeof registroDoComentario>[0][]).map(
    registroDoComentario
  );
}

async function registrosPendentesDoPercurso(
  cliente: ExecutorSql,
  atendimentoId: string,
  recorte: Recorte,
  query: Record<string, string | undefined>
) {
  const periodo = periodoDaQuery(query);
  const conversa = typeof query.conversa === 'string' ? query.conversa.trim() : '';
  const resultado = await cliente.query(
    `SELECT
       c.id AS comentario_id,
       c.texto,
       c.status,
       a.id,
       a.agente_id,
       ag.nome AS agente,
       ag.administradora,
       a.iniciado_em,
       a.motivo,
       a.status AS status_atendimento,
       a.audio
     FROM hq_comentario c
     JOIN hq_atendimento a ON a.id = c.atendimento_id
     JOIN hq_agente_de_voz ag ON ag.id = a.agente_id
     WHERE c.status = 'Pendente'
       AND (
         c.atendimento_id = $1
         OR (
           ($2::text IS NULL OR ag.administradora = $2)
           AND ($3::text IS NULL OR a.agente_id = $3)
           AND (a.iniciado_em AT TIME ZONE 'America/Sao_Paulo')::date >= $4::date
           AND (a.iniciado_em AT TIME ZONE 'America/Sao_Paulo')::date <= $5::date
           AND ($6::text IS NULL OR a.id = $6)
         )
       )`,
    [
      atendimentoId,
      recorte.administradora,
      recorte.agente,
      periodo.inicio,
      periodo.fim,
      conversa || null
    ]
  );

  return (resultado.rows as Parameters<typeof registroDoComentario>[0][]).map(
    registroDoComentario
  );
}

async function inserirCriterios(
  cliente: ExecutorSql,
  sql: string,
  id: string,
  criterios: readonly CriterioAvaliado[]
) {
  for (const [indice, criterio] of criteriosComChave(criterios).entries()) {
    await cliente.query(sql, [
      id,
      indice + 1,
      criterio.chave,
      criterio.nome,
      criterio.estado,
      criterio.pontos,
      criterio.critico
    ]);
  }
}

async function inserirDemonstracao(cliente: ExecutorSql, registro: RegistroDeAtendimento) {
  await cliente.query(inserirAtendimentoSql, valoresDoAtendimento(registro));

  if (registro.avaliacaoDaIa) {
    await cliente.query(
      `INSERT INTO hq_avaliacao_da_ia (atendimento_id, nota) VALUES ($1, $2)`,
      [registro.id, registro.avaliacaoDaIa.nota]
    );
    await inserirCriterios(
      cliente,
      `INSERT INTO hq_criterio_da_avaliacao_da_ia
         (atendimento_id, ordem, chave, nome, estado, pontos, critico)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      registro.id,
      registro.avaliacaoDaIa.criterios
    );
  }

  if (!registro.avaliacaoDoCurador || !registro.curadorDaRevisao) {
    return;
  }

  const avaliacaoId = `revisao-${registro.id}`;
  await cliente.query(
    `INSERT INTO hq_avaliacao_do_curador
       (id, atendimento_id, nota, nota_da_avaliacao_da_ia, curador_id, curador_nome)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      avaliacaoId,
      registro.id,
      registro.avaliacaoDoCurador.nota,
      registro.avaliacaoDoCurador.notaDaAvaliacaoDaIa,
      registro.curadorDaRevisao.id,
      registro.curadorDaRevisao.nome
    ]
  );
  await inserirCriterios(
    cliente,
    `INSERT INTO hq_criterio_da_avaliacao_do_curador
       (avaliacao_id, ordem, chave, nome, estado, pontos, critico)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    avaliacaoId,
    registro.avaliacaoDoCurador.criterios
  );

  if (!registro.avaliacaoDoCurador.comentario) {
    return;
  }

  await cliente.query(
    `INSERT INTO hq_comentario (id, avaliacao_id, atendimento_id, texto)
     VALUES ($1, $2, $3, $4)`,
    [
      `comentario-${registro.id}`,
      avaliacaoId,
      registro.id,
      registro.avaliacaoDoCurador.comentario
    ]
  );
}

export async function aplicarSchema(cliente: ExecutorSql) {
  await cliente.query(schemaSql);
}

export async function semearSeNecessario(cliente: PoolSql, skipSeed: boolean) {
  const estado = await cliente.query(
    `SELECT valor FROM hq_boot WHERE chave = 'seed'`
  );
  const jaSemeado = estado.rows[0]?.valor === 'ok';

  if (!deveSemear({ skipSeed, jaSemeado })) {
    return;
  }

  await emTransacao(cliente, async (conexao) => {
    for (const registro of catalogoDeAtendimentos()) {
      await inserirDemonstracao(conexao, registro);
    }

    await conexao.query(
      `INSERT INTO hq_boot (chave, valor) VALUES ('seed', 'ok')
       ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor`
    );
  });
}

export function valoresDoAtendimento(registro: RegistroDeAtendimento) {
  return [
    registro.id,
    registro.agenteId,
    registro.status,
    registro.iniciadoEm,
    registro.concluidoEm ?? null,
    registro.duracaoEmSegundos ?? null,
    JSON.stringify(registro.transcricao),
    registro.audio ?? null,
    registro.motivo,
    registro.transferencia ?? false,
    custoNumerico(registro.custo),
    registro.iniciadoEm,
    registro.tempoDeEsperaEmSegundos ?? null,
    registro.ferramentas ? JSON.stringify(registro.ferramentas) : null
  ];
}

export async function inserirAtendimentoSeAusente(
  cliente: ExecutorSql,
  registro: RegistroDeAtendimento
) {
  await cliente.query(inserirAtendimentoSeAusenteSql, valoresDoAtendimento(registro));
}

export function repositorioPostgres(pool: PoolSql): PortaDeAtendimentos {
  return {
    async listar() {
      return lerRegistros(pool, {});
    },
    async buscarPorId(id) {
      const registros = await lerRegistros(pool, { id });
      return registros[0];
    },
    async idsConcluidos(ids) {
      if (ids.length === 0) {
        return new Set<string>();
      }

      const resultado = await pool.query(
        `SELECT id FROM hq_atendimento
         WHERE status = 'Concluído' AND id = ANY($1::text[])`,
        [ids]
      );
      return new Set((resultado.rows as { id: string }[]).map((linha) => linha.id));
    },
    async gravarAvaliacaoDaIa(id, entrada) {
      return emTransacao(pool, async (cliente) => {
        const atendimento = await cliente.query(`SELECT status FROM hq_atendimento WHERE id = $1`, [
          id
        ]);
        const recusa = recusaDaAvaliacao(
          atendimento.rows[0] as { status: string } | undefined
        );

        if (recusa) {
          return recusa;
        }

        await cliente.query(`DELETE FROM hq_avaliacao_da_ia WHERE atendimento_id = $1`, [id]);
        await cliente.query(
          `INSERT INTO hq_avaliacao_da_ia (atendimento_id, nota) VALUES ($1, $2)`,
          [id, entrada.nota]
        );
        await inserirCriterios(
          cliente,
          `INSERT INTO hq_criterio_da_avaliacao_da_ia
             (atendimento_id, ordem, chave, nome, estado, pontos, critico)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          id,
          entrada.criterios
        );

        return 'ok' as const;
      });
    },
    async conferir(id, entrada) {
      return emTransacao(pool, async (cliente) => {
        const registros = await lerRegistros(cliente, { id });
        const encontrado = registros[0];
        const recusa = recusaDaConferencia(encontrado);

        if (recusa || !encontrado || !avaliacaoDaIaTemVeredito(encontrado)) {
          return recusa ?? 'indisponivel';
        }

        const avaliacaoId = randomUUID();
        await cliente.query(
          `INSERT INTO hq_avaliacao_do_curador
             (id, atendimento_id, nota, nota_da_avaliacao_da_ia, curador_id, curador_nome)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            avaliacaoId,
            id,
            entrada.nota,
            encontrado.avaliacaoDaIa.nota,
            entrada.curador.id,
            entrada.curador.nome
          ]
        );
        await inserirCriterios(
          cliente,
          `INSERT INTO hq_criterio_da_avaliacao_do_curador
             (avaliacao_id, ordem, chave, nome, estado, pontos, critico)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          avaliacaoId,
          entrada.criterios
        );

        if (entrada.comentario) {
          await cliente.query(
            `INSERT INTO hq_comentario (id, avaliacao_id, atendimento_id, texto)
             VALUES ($1, $2, $3, $4)`,
            [randomUUID(), avaliacaoId, id, entrada.comentario]
          );
        }

        return 'ok' as const;
      });
    },
    async resolverComentario(id, adminId) {
      return emTransacao(pool, async (cliente) => {
        const atual = await cliente.query(
          `SELECT status FROM hq_comentario WHERE id = $1`,
          [id]
        );
        const status = atual.rows[0]?.status as string | undefined;

        if (!status) {
          return 'ausente' as const;
        }

        if (status !== 'Pendente') {
          return 'ja-resolvido' as const;
        }

        await cliente.query(
          `UPDATE hq_comentario
           SET status = 'Resolvido', resolvido_por_id = $2, resolvido_em = now()
           WHERE id = $1 AND status = 'Pendente'`,
          [id, adminId]
        );
        const registros = await registrosDeComentario(cliente, id);
        return registros[0] ?? ('ausente' as const);
      });
    },
    async consultarListagem(recorte, query, modo, perfilId) {
      const registros = await lerRegistros(pool, { recorte, query, modo });
      return aplicarConsultaDaListagem(registros, recorte, query, modo, perfilId);
    },
    async consultarDashboard(recorte, query) {
      const registros = await lerRegistros(pool, { recorte, query, modo: 'dashboard' });
      return aplicarConsultaDoDashboard(registros, recorte, query);
    },
    async consultarManutencao(recorte, query) {
      const registros = await registrosDeComentario(pool, undefined, { recorte, query });
      return aplicarConsultaDaManutencao(registros, recorte, query);
    },
    async consultarPercursoDaManutencao(atendimentoId, recorte, query) {
      const atuais = await lerRegistros(pool, { id: atendimentoId });
      const atual = atuais[0];

      if (!atual) {
        return 'ausente' as const;
      }

      const comentarios = await registrosPendentesDoPercurso(
        pool,
        atendimentoId,
        recorte,
        query
      );
      return consultaDoPercurso(comentarios, atual, recorte, query);
    }
  };
}
