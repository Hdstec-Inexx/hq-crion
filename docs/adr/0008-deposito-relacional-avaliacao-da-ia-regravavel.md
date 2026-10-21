# Depósito relacional Crion, com a Avaliação da IA regravável

O HQ deixa o JSON único de Atendimento e passa a ter depósito relacional próprio (Atendimento, Avaliação, Critério em snapshot, Comentário, Perfil, Agente de Voz, configuração da IA Avaliadora), com a Régua única deste HQ e a Administradora no Agente. As tabelas são as do Crion: o recorte herda o contrato operacional do GEAP (ADR 0006), não o esquema físico. A Avaliação da IA é uma só por Atendimento e uma execução posterior a substitui por inteiro. A Avaliação do Curador também é uma só vigente por Atendimento; pode ser editada no detalhe do Atendimento por Curador (transferindo a autoria para o Curador que editou) ou por Admin (preservando o Curador original), atualizando a Data da Curadoria. As tabelas nascem por migration antes do `listen`.

## Consequências

- A Concordância compara a Avaliação da IA vigente com a Avaliação do Curador. Essa avaliação guarda a nota derivada da Régua, os critérios com a chave estável, a Nota da Avaliação da IA congelada na conferência, o nome do Curador responsável e a Data da Curadoria.
- O Comentário da conferência, quando existe, entra na Fila de Manutenção. Resolver grava o Admin e o momento; na edição da Conferência, o comentário pode ser incluído, alterado (reabrindo como Pendente se já estava Resolvido) ou removido da Fila de Manutenção.
- A Avaliação da IA nasce na primeira execução da IA Avaliadora. A ingestão não a cria nem a substitui; se o Atendimento já existe, atualiza só status, transcrição, duração e Tempo de Espera.
- Custo é numérico. Transferência é booleana obrigatória. E-mail do Perfil é único sem distinguir caixa. “Não se aplica” só no Critério que a Régua admite.
- O id do Atendimento é o id da conversa na fonte. Perfil, Agente de Voz, Régua e configuração da IA são semeados sempre; `SKIP_SEED` pula só Atendimentos de demonstração. A Régua segue só leitura. Não há tabela de sessão nem cópia do JSON antigo. Quem chama o modelo fica fora deste recorte.
