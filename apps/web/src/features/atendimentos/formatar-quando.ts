export function formatarQuando(iso: string) {
  try {
    const parts = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).formatToParts(new Date(iso));
    const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === tipo)?.value ?? '';

    return `${valor('day')}/${valor('month')} ${valor('hour')}:${valor('minute')}`;
  } catch {
    return iso;
  }
}
