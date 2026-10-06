import { useState, type PointerEvent } from 'react';

export function useFraseVisivel(ativa = true) {
  const [visivel, setVisivel] = useState(false);

  return {
    fraseVisivel: ativa && visivel,
    aoPerderFoco() {
      setVisivel(false);
    },
    aoFocar() {
      if (ativa) {
        setVisivel(true);
      }
    },
    aoEntrarComPonteiro(evento: PointerEvent<HTMLElement>) {
      if (!ativa || evento.pointerType === 'touch') {
        return;
      }
      setVisivel(true);
    },
    aoSairComPonteiro(evento: PointerEvent<HTMLElement>) {
      if (evento.currentTarget === document.activeElement) {
        return;
      }
      setVisivel(false);
    }
  };
}
