import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aplicarMigracoes, listarMigracoes } from '../../apps/api/src/db/migrar.js';
import { semearEstrutura } from '../../apps/api/src/db/semente-estrutural.js';
import { motivoUltimoAdmin } from '../../packages/contracts/src/perfil.js';
import { parseAppConfig } from '../../apps/api/src/plugins/config.js';
import {
  fonteDePersistencia,
  ingestaoEsperaOPlugin,
  timeoutDoPluginPersistencia
} from '../../apps/api/src/plugins/persistencia.js';
import { deveSemear } from '../../apps/api/src/modules/atendimentos/semente.js';
import {
  buscarPorId,
  criarPerfil,
  definirAtivo,
  usarDepositoDePerfis
} from '../../apps/api/src/modules/perfil/repositorio.js';

test('env de produção documenta banco Crion, CORS e skip de seed', () => {
  const config = parseAppConfig({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://crion:secret@db.interno:5432/hq_crion',
    CORS_ORIGIN: 'https://hq.crion.example',
    SESSION_SECRET: 'segredo-de-producao',
    SKIP_SEED: 'true',
    ELEVENLABS_API_KEY: 'xi-key',
    S3_BUCKET: 'audios-crion'
  });

  assert.equal(config.DATABASE_URL, 'postgres://crion:secret@db.interno:5432/hq_crion');
  assert.equal(config.CORS_ORIGIN, 'https://hq.crion.example');
  assert.equal(config.SESSION_SECRET, 'segredo-de-producao');
  assert.equal(config.SKIP_SEED, true);
  assert.equal(config.ELEVENLABS_API_KEY, 'xi-key');
  assert.equal(config.S3_BUCKET, 'audios-crion');
  assert.equal(config.HOST, '0.0.0.0');
});

test('produção sem CORS_ORIGIN público recusa o default de localhost', () => {
  assert.throws(
    () =>
      parseAppConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://crion@db/hq_crion'
      }),
    /CORS_ORIGIN/
  );
});

test('produção dá ao plugin persistencia mais que os 10s padrão do Fastify', () => {
  assert.equal(timeoutDoPluginPersistencia({ NODE_ENV: 'production' }) > 10_000, true);
  assert.equal(timeoutDoPluginPersistencia({ NODE_ENV: 'test' }), 10_000);
});

test('Postgres não segura o listen na ingestão ElevenLabs', () => {
  assert.equal(ingestaoEsperaOPlugin('postgres'), false);
  assert.equal(ingestaoEsperaOPlugin('memoria'), true);
});

test('produção com DATABASE_URL usa o adapter Postgres, não o catálogo em memória', () => {
  assert.equal(
    fonteDePersistencia({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://crion@db/hq_crion'
    }),
    'postgres'
  );
});

test('produção sem DATABASE_URL recusa o catálogo em memória', () => {
  assert.throws(
    () =>
      fonteDePersistencia({
        NODE_ENV: 'production'
      }),
    /DATABASE_URL/
  );
});

test('testes e desenvolvimento sem DATABASE_URL continuam na memória', () => {
  assert.equal(fonteDePersistencia({ NODE_ENV: 'test' }), 'memoria');
  assert.equal(fonteDePersistencia({ NODE_ENV: 'development' }), 'memoria');
  assert.equal(
    fonteDePersistencia({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://nao-usar-em-teste'
    }),
    'memoria'
  );
});

test('suíte de aceite opta pelo Postgres sem tirar o teste comum da memória', () => {
  assert.equal(
    fonteDePersistencia({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://crion@db/hq_crion',
      DEPOSITO: 'postgres'
    }),
    'postgres'
  );
  assert.equal(
    fonteDePersistencia({
      NODE_ENV: 'test',
      DEPOSITO: 'postgres'
    }),
    'memoria'
  );
});

test('as migrations numeradas cobrem o depósito, os fatos, a mídia e o boot', () => {
  assert.deepEqual(
    listarMigracoes().map((migracao) => migracao.nome),
    [
      '001_deposito_relacional.sql',
      '002_fatos_do_dominio.sql',
      '003_midia.sql',
      '004_tipo_da_midia.sql',
      '005_boot_e_custo_ausente.sql',
      '006_resumo_e_falhas_da_ia.sql',
      '07_funcao_persistir_avaliacao_da_ia.sql',
      '08_transferencia_transfer_to_number.sql',
      '09_uma_avaliacao_do_curador.sql'
    ]
  );
});

test('SKIP_SEED pula só a demonstração; a semente estrutural não recebe esse flag', () => {
  assert.equal(deveSemear({ skipSeed: true, jaSemeado: false }), false);
  assert.equal(deveSemear({ skipSeed: false, jaSemeado: true }), false);
  assert.equal(deveSemear({ skipSeed: false, jaSemeado: false }), true);
  assert.equal(semearEstrutura.length, 1);
});

function sqlDePersistirAvaliacaoDaIa() {
  const migracao = listarMigracoes().find(
    (item) => item.nome === '07_funcao_persistir_avaliacao_da_ia.sql'
  );
  assert.ok(migracao, 'migration 07 ausente');
  return migracao.sql.replace(/--[^\n]*/g, '');
}

test('persistir_avaliacao_da_ia troca a avaliação inteira sem colidir na chave dos critérios', () => {
  const sql = sqlDePersistirAvaliacaoDaIa();
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION persistir_avaliacao_da_ia\s*\(\s*p_atendimento_id\s+text\s*,\s*p_nota\s+numeric\s*,\s*p_criterios\s+jsonb\s*,\s*p_resumo_atendimento\s+text\s+default\s+null\s*,\s*p_falhas_identificadas\s+jsonb\s+default\s+'\[\]'::jsonb\s*\)/i
  );
  const bloqueiaAtendimento = sql.search(
    /FROM\s+hq_atendimento\b[\s\S]*FOR\s+UPDATE/i
  );
  const apagaCriterios = sql.search(/DELETE\s+FROM\s+hq_criterio_da_avaliacao_da_ia\b/i);
  const apagaAvaliacao = sql.search(/DELETE\s+FROM\s+hq_avaliacao_da_ia\b/i);
  const insereAvaliacao = sql.search(/INSERT\s+INTO\s+hq_avaliacao_da_ia\b/i);
  const insereCriterios = sql.search(/INSERT\s+INTO\s+hq_criterio_da_avaliacao_da_ia\b/i);

  assert.equal(bloqueiaAtendimento >= 0 && bloqueiaAtendimento < apagaCriterios, true);
  assert.equal(apagaCriterios >= 0 && apagaCriterios < apagaAvaliacao, true);
  assert.match(sql, /search_path\s*=\s*pg_catalog\s*,\s*public/i);
  assert.equal(apagaAvaliacao < insereAvaliacao, true);
  assert.equal(insereAvaliacao < insereCriterios, true);
  assert.equal(/\bWITH\b/i.test(sql), false);
  assert.match(sql, /WHERE\s+atendimento_id\s*=\s*p_atendimento_id/i);
  assert.match(sql, /resumo_atendimento/);
  assert.match(sql, /falhas_identificadas/);
  assert.match(sql, /jsonb_array_elements\s*\(/i);
  assert.match(
    sql,
    /ordem[\s\S]*chave[\s\S]*nome[\s\S]*estado[\s\S]*pontos[\s\S]*critico/i
  );
});

test('nós n8n regravam atendimento e avaliação com parâmetros, sem interpolar texto', () => {
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '../../db/n8n');
  const atendimento = readFileSync(join(raiz, 'salva-atendimento.sql'), 'utf8');
  const avaliacao = readFileSync(join(raiz, 'salva-avaliacao.sql'), 'utf8');

  assert.match(atendimento, /ON CONFLICT \(id\) DO UPDATE SET/);
  assert.match(atendimento, /status = EXCLUDED\.status/);
  assert.match(atendimento, /duracao_em_segundos = EXCLUDED\.duracao_em_segundos/);
  assert.match(atendimento, /transcricao = EXCLUDED\.transcricao/);
  assert.match(atendimento, /audio = EXCLUDED\.audio/);
  assert.match(atendimento, /tempo_de_espera_em_segundos = EXCLUDED\.tempo_de_espera_em_segundos/);
  assert.match(atendimento, /ELSE EXCLUDED\.transferencia/);
  assert.equal(atendimento.includes('{{'), false);
  assert.match(
    avaliacao,
    /SELECT \* FROM persistir_avaliacao_da_ia\(\s*\$1::text,\s*\$2::numeric,\s*\$3::jsonb,\s*\$4::text,\s*\$5::jsonb\s*\)/
  );
  assert.equal(avaliacao.includes('{{'), false);
});

test('a migration da conferência única guarda a avaliação mais recente antes do índice', () => {
  const migracao = listarMigracoes().find(
    (item) => item.nome === '09_uma_avaliacao_do_curador.sql'
  );
  assert.ok(migracao, 'migration 09 ausente');
  const sql = migracao.sql.replace(/--[^\n]*/g, '');
  const desliga = sql.search(/DISABLE TRIGGER hq_avaliacao_do_curador_imutavel/i);
  const apagaComentario = sql.search(/DELETE FROM hq_comentario/i);
  const apagaCriterio = sql.search(/DELETE FROM hq_criterio_da_avaliacao_do_curador/i);
  const apagaAvaliacao = sql.search(/DELETE FROM hq_avaliacao_do_curador/i);
  const religa = sql.search(/ENABLE TRIGGER hq_avaliacao_do_curador_imutavel/i);
  const indice = sql.search(/CREATE UNIQUE INDEX IF NOT EXISTS hq_avaliacao_do_curador_por_atendimento/i);

  assert.equal(desliga >= 0 && desliga < apagaComentario, true);
  assert.equal(apagaComentario < apagaCriterio && apagaCriterio < apagaAvaliacao, true);
  assert.equal(apagaAvaliacao < religa && religa < indice, true);
  assert.match(sql, /ORDER BY vig\.criada_em DESC, vig\.id DESC/i);
});

test('as migrations não nomeiam sessão', () => {
  assert.equal(
    listarMigracoes().some((migracao) => migracao.nome.toLowerCase().includes('sessao')),
    false
  );
});

function poolDeTeste(
  query: (texto: string, valores?: unknown[]) => { rows: unknown[]; rowCount?: number }
) {
  const vistos: string[] = [];
  const cliente = {
    async query(texto: string, valores?: unknown[]) {
      vistos.push(texto);
      return query(texto, valores);
    },
    release() {}
  };

  return {
    vistos,
    pool: {
      async connect() {
        return cliente;
      },
      async query() {
        return { rows: [] };
      }
    }
  };
}

test('segunda aplicação não repete a migration', async () => {
  const aplicadas = new Set<string>();
  const { vistos, pool } = poolDeTeste((texto, valores) => {
    if (texto.includes('INSERT INTO hq_migracao')) {
      aplicadas.add(String(valores?.[0]));
    }

    if (texto.includes('SELECT nome FROM hq_migracao')) {
      return { rows: [...aplicadas].map((nome) => ({ nome })) };
    }

    return { rows: [] };
  });

  await aplicarMigracoes(pool);
  const marco = vistos.length;
  await aplicarMigracoes(pool);

  assert.equal(aplicadas.has('001_deposito_relacional.sql'), true);
  assert.equal(aplicadas.has('002_fatos_do_dominio.sql'), true);
  assert.equal(aplicadas.has('005_boot_e_custo_ausente.sql'), true);
  assert.equal(aplicadas.has('07_funcao_persistir_avaliacao_da_ia.sql'), true);
  assert.equal(
    vistos.filter((texto) => texto.includes('FUNCTION persistir_avaliacao_da_ia')).length,
    1
  );
  assert.equal(
    vistos.slice(marco).some((texto) => texto.includes('FUNCTION persistir_avaliacao_da_ia')),
    false
  );
  assert.equal(
    vistos.slice(marco).some((texto) => texto.includes('hq_perfil')),
    false
  );
});

test('semente estrutural é idempotente e não grava Atendimento', async () => {
  const { vistos, pool } = poolDeTeste(() => ({ rows: [] }));

  await semearEstrutura(pool);
  await semearEstrutura(pool);

  const inserts = vistos.filter((texto) => texto.includes('INSERT INTO'));
  assert.equal(inserts.length > 0, true);
  assert.equal(
    inserts.every((texto) => texto.includes('ON CONFLICT')),
    true
  );
  assert.equal(inserts.filter((texto) => texto.includes('hq_perfil')).length, 6);
  assert.equal(
    inserts.filter((texto) => texto.includes('hq_agente_de_voz')).length,
    8
  );
  assert.equal(
    inserts.some((texto) => /INSERT INTO hq_atendimento\b/.test(texto)),
    false
  );
  assert.equal(
    inserts.some((texto) => texto.includes('hq_avaliacao')),
    false
  );
  assert.equal(
    inserts.some((texto) => texto.includes('hq_comentario')),
    false
  );
});

test('o depósito recusa desativar o Admin quando o outro Admin já saiu', async () => {
  await criarPerfil({
    nome: 'Outro Admin',
    email: 'outro.admin@crion',
    papel: 'Admin',
    senha: 'senha-inicial'
  });
  const textos: string[] = [];
  usarDepositoDePerfis({
    async query(texto: string) {
      textos.push(texto);
      return { rows: [], rowCount: 0 };
    }
  });

  try {
    const resultado = await definirAtivo('perfil-bruno', false);
    assert.equal(resultado, motivoUltimoAdmin);
    assert.match(textos[0] ?? '', /EXISTS/);
    assert.equal(buscarPorId('perfil-bruno')?.ativo, true);
  } finally {
    usarDepositoDePerfis(null);
  }
});
