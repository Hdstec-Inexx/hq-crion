export type ResultadoSql = {
  rows: any[];
  rowCount?: number | null;
};

export type ClienteSql = {
  query(texto: string, valores?: unknown[]): Promise<ResultadoSql>;
};

export type ClienteConectado = ClienteSql & {
  release(): void;
};

export type PoolDeDeposito = ClienteSql & {
  connect(): Promise<ClienteConectado>;
};

export async function comCliente<T>(
  pool: PoolDeDeposito,
  trabalho: (cliente: ClienteConectado) => Promise<T>
) {
  const cliente = await pool.connect();

  try {
    return await trabalho(cliente);
  } finally {
    cliente.release();
  }
}

export async function naTransacao(
  cliente: ClienteConectado,
  trabalho: () => Promise<void>
) {
  await cliente.query('BEGIN');

  try {
    await trabalho();
    await cliente.query('COMMIT');
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  }
}

export async function emTransacao(
  pool: PoolDeDeposito,
  trabalho: (cliente: ClienteConectado) => Promise<void>
) {
  await comCliente(pool, (cliente) => naTransacao(cliente, () => trabalho(cliente)));
}

export async function exigirLinhaGravada(
  cliente: ClienteSql,
  texto: string,
  valores: unknown[],
  ausente: string
) {
  const gravado = await cliente.query(texto, valores);

  if (!gravado.rowCount) {
    throw new Error(ausente);
  }
}
