import assert from 'node:assert/strict';
import test from 'node:test';
import { aplicarMigracoes, listarMigracoes } from '../../apps/api/src/db/migrar.js';
import { semearEstrutura } from '../../apps/api/src/db/semente-estrutural.js';
import { motivoUltimoAdmin } from '../../packages/contracts/src/perfil.js';
import { parseAppConfig } from '../../apps/api/src/plugins/config.js';
import { fonteDePersistencia } from '../../apps/api/src/plugins/persistencia.js';
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
      '005_boot_e_custo_ausente.sql'
    ]
  );
});

test('SKIP_SEED pula só a demonstração; a semente estrutural não recebe esse flag', () => {
  assert.equal(deveSemear({ skipSeed: true, jaSemeado: false }), false);
  assert.equal(deveSemear({ skipSeed: false, jaSemeado: true }), false);
  assert.equal(deveSemear({ skipSeed: false, jaSemeado: false }), true);
  assert.equal(semearEstrutura.length, 1);
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
    papel: 'Admin'
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
