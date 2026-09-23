import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const prefixo = 'scrypt';
const tamanho = 32;

export function hashDaSenha(senha: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(senha, salt, tamanho).toString('hex');
  return `${prefixo}$${salt}$${hash}`;
}

export function senhaConfere(guardada: string, recebida: string) {
  if (guardada.startsWith(`${prefixo}$`)) {
    const partes = guardada.split('$');
    const salt = partes[1] ?? '';
    const esperado = partes[2] ?? '';
    const calculado = scryptSync(recebida, salt, tamanho).toString('hex');
    const esquerda = Buffer.from(esperado);
    const direita = Buffer.from(calculado);

    if (esquerda.length !== direita.length) {
      timingSafeEqual(esquerda, esquerda);
      return false;
    }

    return timingSafeEqual(esquerda, direita);
  }

  const esperada = Buffer.from(guardada);
  const informada = Buffer.from(recebida);

  if (esperada.length !== informada.length) {
    timingSafeEqual(esperada, esperada);
    return false;
  }

  return timingSafeEqual(esperada, informada);
}
