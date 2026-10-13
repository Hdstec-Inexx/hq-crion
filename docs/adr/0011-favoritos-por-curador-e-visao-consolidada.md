# Favoritos por Curador com desfecho individual e visão consolidada de Gestão

Status: accepted.

A marcação de Favorito registra que o Agente de Voz teve ótimo desempenho em um Atendimento já persistido no HQ Crion. Adota-se uma relação independente por par `(perfil_id, atendimento_id)` com carimbo de marcação (`favoritado_em`), em vez de uma flag booleana única no Atendimento. Cada Curador marca e desfaz exclusivamente o seu próprio Favorito, visualizando somente o seu estado ativo; Perfis desativados mantêm seus registros no histórico e nenhum papel (incluindo Admin) tem permissão de apagar marcas de terceiros.

Para Gestão e Admin, cada Atendimento com ao menos um Favorito ativo aparece uma única vez nas listagens, exibindo a contagem e os nomes dos Perfis via tooltip (`★ N`), com ordenação baseada no Favorito mais recente ainda vigente (`MAX(favoritado_em)`). A lista de Favoritos é atemporal (sem mês civil implícito), acessível por item próprio na Casca Autenticada após Atendimentos para preservar as primeiras áreas de cada papel, integrando o Recorte em cascata do Crion (Administradora → Agente de Voz), busca por ID da conversa e filtro por Perfil de Curador para Gestão e Admin. A marcação não gera métricas nos Dashboards. No Monitoramento ao Vivo, a ação permanece desabilitada até a persistência no banco.
