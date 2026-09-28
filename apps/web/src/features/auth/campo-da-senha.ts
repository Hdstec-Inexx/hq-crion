export type VisibilidadeDaSenha = 'oculta' | 'visivel';

export function campoDaSenha(visibilidade: VisibilidadeDaSenha) {
  if (visibilidade === 'visivel') {
    return { tipo: 'text' as const, rotulo: 'Ocultar senha' };
  }

  return { tipo: 'password' as const, rotulo: 'Mostrar senha' };
}

export function alternarVisibilidadeDaSenha(
  visibilidade: VisibilidadeDaSenha
): VisibilidadeDaSenha {
  return visibilidade === 'oculta' ? 'visivel' : 'oculta';
}
