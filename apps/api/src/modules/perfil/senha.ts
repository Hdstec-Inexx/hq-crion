import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const prefixo = 'scrypt';
const tamanhoDaChave = 32;
const opcoes = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashDaSenha(senha: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(senha, salt, tamanhoDaChave, opcoes).toString('hex');
  return `${prefixo}$${salt}$${hash}`;
}

export const hashParaPerfilAusente = hashDaSenha('\0');

export function senhaEstaHasheada(guardada: string) {
  return guardada.startsWith(`${prefixo}$`);
}

export function senhaConfere(guardada: string, recebida: string) {
  if (senhaEstaHasheada(guardada)) {
    const partes = guardada.split('$');
    const salt = partes[1] ?? '';
    const esperado = partes[2] ?? '';
    const calculado = scryptSync(recebida, salt, tamanhoDaChave, opcoes).toString('hex');
    const digestGuardado = Buffer.from(esperado);
    const digestCalculado = Buffer.from(calculado);

    if (digestGuardado.length !== digestCalculado.length) {
      timingSafeEqual(digestGuardado, digestGuardado);
      return false;
    }

    return timingSafeEqual(digestGuardado, digestCalculado);
  }

  const esperada = Buffer.from(guardada);
  const informada = Buffer.from(recebida);

  if (esperada.length !== informada.length) {
    timingSafeEqual(esperada, esperada);
    return false;
  }

  return timingSafeEqual(esperada, informada);
}
