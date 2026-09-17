export function deveSemear(input: { skipSeed: boolean; jaSemeado: boolean }) {
  return !input.skipSeed && !input.jaSemeado;
}
