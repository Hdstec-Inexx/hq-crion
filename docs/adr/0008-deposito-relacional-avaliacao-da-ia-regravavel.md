# Depósito relacional Crion, com a Avaliação da IA regravável

O HQ deixa o JSON único de Atendimento e passa a ter depósito relacional próprio (Atendimento, Avaliação, Critério em snapshot, Comentário, Perfil, Agente de Voz, configuração da IA Avaliadora), com a Régua única deste HQ e a Administradora no Agente. As tabelas são as do Crion: o recorte herda o contrato operacional do GEAP (ADR 0006), não o esquema físico. A Avaliação da IA é uma só por Atendimento e uma execução posterior a substitui por inteiro. A Avaliação do Curador segue revisão imutável; a vigente é a mais recente e a Fila de Curadoria não reabre. As tabelas nascem por migration antes do `listen`.

## Consequências

- A Concordância compara a Avaliação da IA vigente com a revisão vigente do Curador. A revisão guarda a nota, os critérios com a chave estável, a Nota da Avaliação da IA congelada na conferência e o nome do Curador naquele momento.
- Cada revisão com texto é um Comentário novo na Fila de Manutenção; o anterior permanece no status que já tinha. O detalhe mostra só a revisão vigente. Resolver grava o Admin e o momento; texto, revisão e Atendimento não mudam.
- A Avaliação da IA nasce na primeira execução da IA Avaliadora. A ingestão não a cria nem a substitui; se o Atendimento já existe, atualiza só status, transcrição, duração e Tempo de Espera.
- Custo é numérico. Transferência é booleana obrigatória. E-mail do Perfil é único sem distinguir caixa. “Não se aplica” só no Critério que a Régua admite.
- O id do Atendimento é o id da conversa na fonte. Perfil, Agente de Voz, Régua e configuração da IA são semeados sempre; `SKIP_SEED` pula só Atendimentos de demonstração. A Régua segue só leitura. Não há tabela de sessão nem cópia do JSON antigo. Quem chama o modelo fica fora deste recorte.
