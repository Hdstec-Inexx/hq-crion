export const motivosOficiaisDaClara = [
  'Pagamento no cartão',
  'Liberação de atendimento',
  'Alteração cadastral de endereço',
  'Alteração cadastral de nome e data de nascimento',
  'Negociação',
  'Consulta de carência',
  'Coparticipação e contestação',
  'Emissão de documentos: carta de permanência, demonstrativo, extrato de coparticipação e ficha financeira',
  'Reemissão de boleto',
  'Boleto',
  'Reajuste',
  'Inclusão de RN/RC',
  'Cancelamento de elegibilidade',
  'Confirmação de pagamento',
  'Boletos não gerados',
  'Atraso na liberação do código da carteirinha'
] as const;

export type MotivoOficialDaClara = (typeof motivosOficiaisDaClara)[number];

export function chaveCanonicaDoMotivo(texto: string): string {
  if (!texto || typeof texto !== 'string') {
    return '';
  }

  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ªº]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function canonicalizarMotivo(
  novoMotivo: string,
  motivosExistentes: readonly string[] = []
): string {
  if (!novoMotivo || typeof novoMotivo !== 'string') {
    return novoMotivo ?? '';
  }

  const chaveNova = chaveCanonicaDoMotivo(novoMotivo);
  if (!chaveNova) {
    return novoMotivo.trim();
  }

  for (const oficial of motivosOficiaisDaClara) {
    if (chaveCanonicaDoMotivo(oficial) === chaveNova) {
      return oficial;
    }
  }

  for (const existente of motivosExistentes) {
    if (existente && typeof existente === 'string' && chaveCanonicaDoMotivo(existente) === chaveNova) {
      return existente;
    }
  }

  return novoMotivo.trim();
}
