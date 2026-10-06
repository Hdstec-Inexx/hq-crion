import { useState, type PointerEvent } from 'react';

export function useFraseVisivel(temFrase = true) {
  const [visivel, setVisivel] = useState(false);

  return {
    fraseVisivel: temFrase && visivel,
    aoPerderFoco() {
      setVisivel(false);
    },
    aoFocar() {
      if (temFrase) {
        setVisivel(true);
      }
    },
    aoEntrarComPonteiro(evento: PointerEvent<HTMLElement>) {
      if (!temFrase || evento.pointerType === 'touch') {
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
