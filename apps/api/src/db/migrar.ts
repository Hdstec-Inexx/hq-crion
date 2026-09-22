import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { comCliente, naTransacao, type PoolDeDeposito } from './cliente.js';

export type Migracao = {
  nome: string;
  sql: string;
};

export function diretorioDeMigracoes() {
  const aqui = dirname(fileURLToPath(import.meta.url));
  const candidatos = [
    join(aqui, '..', '..', '..', '..', 'db', 'migrations'),
    join(aqui, '..', '..', 'db', 'migrations')
  ];
  const encontrado = candidatos.find((caminho) => existsSync(caminho));

  if (!encontrado) {
    throw new Error('Não encontrei db/migrations para aplicar o depósito.');
  }

  return encontrado;
}

export function listarMigracoes(diretorio = diretorioDeMigracoes()): Migracao[] {
  return readdirSync(diretorio)
    .filter((nome) => nome.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))
    .map((nome) => ({
      nome,
      sql: readFileSync(join(diretorio, nome), 'utf8')
    }));
}

export function migracoesPendentes(migracoes: Migracao[], aplicadas: string[]) {
  const feitas = new Set(aplicadas);
  return migracoes.filter((migracao) => !feitas.has(migracao.nome));
}

export async function aplicarMigracoes(pool: PoolDeDeposito) {
  await comCliente(pool, async (cliente) => {
    await cliente.query(`
      CREATE TABLE IF NOT EXISTS hq_migracao (
        nome TEXT PRIMARY KEY,
        aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    const existentes = await cliente.query('SELECT nome FROM hq_migracao');
    const pendentes = migracoesPendentes(
      listarMigracoes(),
      existentes.rows.map((linha: { nome: string }) => linha.nome)
    );

    for (const migracao of pendentes) {
      await naTransacao(cliente, async () => {
        // Sem parâmetros de propósito: o driver usa o protocolo simples e
        // executa o arquivo inteiro, inclusive funções com $$ .
        await cliente.query(migracao.sql);
        await cliente.query('INSERT INTO hq_migracao (nome) VALUES ($1)', [
          migracao.nome
        ]);
      });
    }
  });
}
