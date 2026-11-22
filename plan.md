# Plano de implementação — J Sampaio Postos | Sistema de Gestão de Fechamentos

## Objetivo e abordagem

Construir uma aplicação web responsiva e instalável para substituir o controle físico de vendas do J Sampaio Postos. A aplicação será operacional, e não uma demonstração com dados simulados: leituras, totais, indicadores, relatórios e PDFs deverão derivar dos dados persistidos. Quando não houver dados reais, a interface mostrará estado vazio/zero, sem inventar faturamento ou usuários.

A base provisionada é o template real `web-db-user`: React 19, TypeScript, Vite, Tailwind 4, Express, tRPC, Drizzle ORM e MySQL gerenciado. O projeto já possui `client/`, `server/`, `drizzle/`, `shared/`, scripts `pnpm check`, `pnpm test`, `pnpm build` e porta 3000. Servidor e banco foram selecionados porque o escopo exige autenticação, validação no servidor e persistência entre dispositivos. O banco é compartilhado entre Preview e publicação; migrações serão aditivas e nenhuma massa financeira falsa será inserida.

O documento anexado pede contas individuais por nome de usuário e senha; portanto, a autenticação da aplicação será própria, com senha protegida por hash criptográfico, sessão opaca em cookie `httpOnly`/`Secure`, expiração/revogação e autorização nos procedimentos tRPC do servidor. Não haverá cadastro público irrestrito: administradores gerenciarão contas, e o provisionamento inicial já é implementado por `auth.bootstrap`, protegido por `INITIAL_ADMIN_SETUP_KEY` no servidor. Essa rota precisa ser portada e validada no Worker; a chave não deve ser publicada no navegador nem no código.

## Escopo funcional

1. **Acesso e permissões:** perfis frentista, gerente e administrador; login/logout individual; proteção de rotas e operações no backend; associação de usuários, funcionários e unidade; contas ativas/inativas. Frentistas acessam seus próprios registros; gerentes acessam operação e relatórios gerenciais; administradores controlam usuários, preços, bicos, tolerância, dados empresariais, unidade e políticas.
2. **Fechamento diário:** fluxo em quatro etapas com data/turno/responsáveis; quatro bicos configurados (01–03 Gasolina Comum e 04 Diesel S10); leituras decimais e validação de leitura final; cálculo de litros e valores usando preço vigente copiado para o fechamento; recebimentos em dinheiro, PIX, débito e crédito; diferença e classificação CONFERIDO/SOBRA/FALTA pela tolerância configurada; observações e confirmações; revisão, rascunho e finalização. Restrição única por data/turno/unidade, exceto reabertura autorizada e auditada. Registros finalizados não serão alterados ou apagados silenciosamente.
3. **Operação e gestão:** dashboard com filtros de período, indicadores calculados do banco, acompanhamento dos turnos, gráficos de faturamento/combustível/recebimentos/volume/turnos e atalhos; histórico pesquisável e detalhe; relatórios financeiro, combustível, turno, funcionário e divergências; gestão de funcionários e usuários; configurações; trilha de auditoria de correções, reaberturas e mudanças sensíveis.
4. **Documentos e compartilhamento:** PDF individual e consolidado diário em A4, com a marca oficial e dados empresariais; impressão e exportação de relatórios para Excel. O compartilhamento usará Web Share API com arquivo quando o navegador suportar; caso contrário, baixará o PDF e abrirá o WhatsApp com a mensagem preenchida. A interface informará claramente que o envio depende da ação do usuário, sem simular confirmação de envio.
5. **PWA e conectividade:** manifest próprio, ícone baseado no arquivo de marca sem redesenho, service worker para shell/recursos compatíveis e interface responsiva. Rascunhos offline poderão ficar temporariamente no armazenamento local do dispositivo para sincronização posterior; não serão tratados como gravação definitiva até confirmação do servidor. Exibir estados offline/sincronizando/sincronizado/falha e evitar duplicação na sincronização.
6. **Expansão:** modelar registros com `unitId` e preparar entidades de unidades para futura operação multiunidade, mantendo J Sampaio Postos como unidade operacional inicial. Dados empresariais informados no documento-fonte: D ANDRADE SAMPAIO LTDA.; nome fantasia informado POSTO J. SAMPAIO; CNPJ 46.691.152/0001-89; Rua Hildenora Gusmão, 231 – Centro, Vargem Grande/MA, CEP 65430-000.

## Dados e segurança

As tabelas Drizzle/MySQL cobrirão unidades e configurações, usuários/sessões, funcionários, bicos e histórico de preços, fechamentos, leituras por bico, recebimentos, justificativas/reaberturas e eventos de auditoria. O banco aplicará chaves estrangeiras, índices e unicidade por unidade/data/turno; valores monetários serão armazenados em centavos inteiros para evitar erros de ponto flutuante, mantendo cálculos e exibição em formato brasileiro. Regras e permissões serão validadas novamente no servidor; alterações de valores finalizados criarão trilha com autor, horário, justificativa e antes/depois. Credenciais privadas não irão para o bundle frontend.

Os preços e a tolerância vigentes serão configuráveis, mas cada fechamento preservará seus valores aplicados. O estado vazio do banco não será preenchido com exemplos financeiros. O primeiro administrador não terá senha padrão conhecida nem segredo de bootstrap publicado no navegador.

## Organização prevista

- `client/src/pages/`: Dashboard, Login/Configuração inicial, Novo Fechamento, Histórico/Detalhe, Relatórios, Funcionários, Usuários, Configurações e Auditoria.
- `client/src/components/`: navegação adaptável, marca, cards, filtros, gráficos, tabelas, estados de conectividade e componentes dos passos de fechamento.
- `client/src/lib/`: cliente tRPC, formatos de moeda/data, cálculos compartilhados, geração de PDF/planilhas e fila local de rascunhos.
- `client/public/`: logotipo oficial enviado, manifest, ícones derivados e service worker.
- `server/_core/`: autenticação/sessões, middleware de papéis, contexto, servidor e endpoints HTTP de apoio.
- `server/routers/` (ou módulos de domínio ligados a `server/routers.ts`): procedimentos validados para fechamentos, dashboard/relatórios, funcionários, usuários, configurações e auditoria.
- `server/db/` (ou consultas organizadas em `server/db.ts`): operações persistentes e transacionais por domínio.
- `drizzle/schema.ts` e `drizzle/`: entidades, relações e migrações versionadas.
- `shared/`: tipos/validações Zod e regras monetárias compartilhadas entre cliente e servidor.

## Direção de design

Alternativas consideradas: “ERP financeiro editorial, limpo e operacional” — probabilidade 0,07; “Painel industrial escuro de alto contraste” — probabilidade 0,04; “Administração minimalista baseada em tabelas” — probabilidade 0,03. Escolha: **ERP financeiro editorial, limpo e operacional**, alinhado ao logotipo e às referências do solicitante.

- **Movimento:** design editorial suíço aplicado a um painel financeiro moderno, com hierarquia tipográfica clara e componentes precisos.
- **Princípios centrais:** números legíveis à primeira vista; fluxo de fechamento curto e sequencial; divergências destacadas sem ambiguidade; rastreabilidade sem aparência de planilha.
- **Filosofia de cor:** azul-marinho transmite confiança e estrutura; amarelo do logotipo orienta ações e foco; branco e cinza-claro dão espaço e legibilidade; verde, vermelho e laranja comunicam estado sem depender somente da cor.
- **Paradigma de layout:** navegação lateral persistente no desktop e barra/folha de navegação compacta no celular; conteúdo operacional por seções e resumos alinhados, com tabela em telas amplas e cartões em telas estreitas.
- **Elementos de assinatura:** filete amarelo para ação primária/contexto ativo; placas de status com rótulo e ícone; totais monetários em tipografia tabular.
- **Interação e animação:** foco visível, formulários com feedback imediato, revisão antes de finalizar e transições breves (120–180 ms); respeitar `prefers-reduced-motion`.
- **Tipografia:** Inter ou fonte sans-serif de sistema para interface, com números tabulares; títulos compactos em peso semibold e rótulos de campos curtos.
- **Essência da marca:** ferramenta de precisão para quem fecha e acompanha os turnos no J Sampaio Postos; personalidade confiável, objetiva e organizada.
- **Voz:** instruções diretas e tranquilas; CTAs orientados à ação. Exemplos: “Confira os valores antes de finalizar.” “Diferença de R$ 20,00 — registre a justificativa do turno.”
- **Logotipo:** utilizar o arquivo oficial recebido integralmente, sem redesenhar nem alterar cores, proporções ou elementos; aplicar em login, navegação, documentos e identidade instalável.
- **Cor proprietária:** azul-marinho do logotipo, acompanhado pelo amarelo original como destaque.

## Restrições e decisões importantes

- A interface não exibirá lançamentos fictícios para preencher gráficos. PDFs e relatórios refletirão registros reais do banco.
- Compatibilidade com compartilhamento de arquivo depende do navegador/dispositivo; fallback de download + WhatsApp não equivale a envio automático.
- A exigência do documento menciona Supabase/PostgreSQL como sugestão, mas aceita arquitetura equivalente; será usada a infraestrutura gerenciada provisionada para este projeto (MySQL), com backend, persistência, migrações e autorização no servidor.
- O texto do requisito de expansão termina truncado no anexo após “Usuários vincula...”; este plano preserva as instruções explícitas disponíveis e prepara `unitId` para usuários e registros.

## Fluxo de entrega

Após aprovação deste plano, converter as cláusulas do documento em `TODO.md` por resultado independente, preservando regras, valores, perfis, estados e exceções; configurar diagnósticos do TypeScript antes da primeira leva de código; implementar primeiro fundação de dados/autenticação e o fluxo de fechamento, depois gestão/dashboard/histórico/relatórios, e por fim documentos/PWA/offline; iniciar o serviço pelo runtime gerenciado; executar verificações disponíveis e revisão read-only do escopo; corrigir problemas confirmados; manter publicação separada do Preview e não publicar sem pedido explícito.


## Evolução funcional — mobile, estoque e divergências (21/11/2026)

### Abordagem e limites

Evoluir a aplicação React + Vite + TypeScript, Express/tRPC, Drizzle/MySQL e a navegação Wouter existentes; não reconstruir a aplicação, reinicializar usuários nem alterar registros financeiros existentes. O banco de desenvolvimento e o de publicação são compartilhados: qualquer alteração de esquema será aditiva, versionada e revisada antes de aplicar. Não inserir tanques, capacidades, estoque, fornecedor, consumo ou divergências fictícias. O fechamento pode continuar operando antes de o administrador configurar estoque; nesse estado a interface informa que o estoque ainda não está configurado e não cria baixas sem tanque/origem definida. Depois da ativação do estoque, cada bico que gerar volume precisa estar mapeado a exatamente um tanque compatível; não distribuir automaticamente vendas entre vários tanques.

### Arquitetura dos módulos

- Persistência: acrescentar entidades Drizzle para tanques, mapeamento bico–tanque, movimentos de estoque, recebimentos, medições físicas, ocorrências de divergência, participantes/alocações e análises de ajuste de folha. Guardar litros com precisão de três casas, moeda em centavos e chaves de idempotência únicas. A quantidade teórica deriva do estoque de abertura e dos movimentos assinados; a medição física não substitui o saldo teórico. Corrigir uma baixa existente por movimento compensatório auditado, nunca por edição silenciosa do histórico.
- Integração de fechamento: no ato de finalização/confirmação, gravar uma saída por bico e ocorrência de divergência por fechamento quando aplicável, dentro da mesma transação. Revisões/reaberturas preservam os movimentos originais e criam apenas o delta necessário, com uma chave idempotente por fechamento/revisão/bico. Sem mapeamento configurado, não inventar tanque nem distribuir litros; apresentar erro/pendência ao gerente depois que o módulo de estoque estiver ativado.
- Backend: manter autorização por `protectedProcedure`, `managerProcedure` e `adminProcedure`, separar endpoints de estoque e divergências em roteadores de domínio e incluir todas as consultas e mutações no `appRouter`. Frentista só acessa ocorrências próprias; gerente consulta e analisa; administrador administra tanques, limites e eventual aprovação administrativa. Nenhuma tela substitui validação no backend.
- Interface: preservar paleta e identidade visual existentes. Expandir a navegação mobile para Início, Fechamentos, Estoque, Relatórios e Mais; manter menu completo em desktop. Transformar a tabela de leituras dos bicos em cartões no celular, usar áreas de toque acessíveis, campos numéricos, impedir duplo envio e evitar corte/rolagem horizontal indevida nas larguras 320–430 px e em tablets.
- Estoque: cadastro de tanque armazena identificação/código, combustível, capacidades total e operacional, estoque mínimo e de abertura, data operacional de início, status, prazos de entrega e limites de alerta. Combustíveis iniciais são Gasolina Comum e Diesel S10; suportar vários tanques do mesmo produto e preparar o catálogo para produtos futuros. Entradas guardam tanque, fornecedor, documento, horário, litros, custo, responsável, observação e referência opcional a comprovante. Baixas extraordinárias requerem motivo, data, responsável e autorização. Medições guardam físico, teórico à medição, diferença e percentual.
- Indicadores: médias de consumo por 7/15/30 dias calculadas apenas com fechamentos reais após a data inicial do tanque; autonomia não é estimada se não houver média positiva e baixa confiabilidade é explicitada. Alertas por mínimo, autonomia de 3/2 dias, divergência física/teórica e atualização antiga são derivados de limites configuráveis. O planejamento calcula sugestão limitada à capacidade operacional e nunca faz pedido automático. Dashboard exibe cada tanque, litros, capacidade, ocupação, barra, média, autonomia, previsão e estado; medição física é informação complementar.
- Divergências: criar ocorrência idempotente vinculada ao fechamento, funcionário, data/turno, tipo/valor e conferente, sem ocultar eventos individuais ao calcular saldo. Quando existir mais de um responsável, a atribuição deve ser explícita e alocada; sem rateio confirmado por gerente, a ocorrência permanece sem imputação individual. Histórico individual e fechamento mensal incluem contagens, totais, saldo, detalhes e exportação. Análise mantém status, comentários, justificativas, evidências, decisão e responsável. Ajuste de folha é somente um registro de análise: nunca aplicar desconto automaticamente, presumir culpa ou compensar sobras/faltas; aprovação separada pelo administrador e validação administrativa/legal continuam necessárias.
- Relatórios: reutilizar componentes atuais de exportação quando compatíveis; acrescentar filtros por período, tanque, combustível, movimento e funcionário, além de exportação Excel/PDF para estoque e divergências mensais.

### Estrutura atual observada

- `client/src/App.tsx` mantém a sessão e renderiza a página autenticada `client/src/pages/Home.tsx`.
- `Home.tsx` usa Wouter para as páginas operacionais, abriga navegação e formulários de fechamento, e consome tRPC.
- `client/src/index.css` contém a identidade e os breakpoints atuais; novos componentes devem preferir arquivos por módulo para não aumentar o monólito.
- `server/routers.ts` registra autenticação, funcionários, usuários, configurações, fechamentos, analytics, relatórios e auditoria; novos domínios serão roteadores separados.
- `drizzle/schema.ts` e `drizzle/` mantêm o modelo MySQL e as migrações; `server/_core/trpc.ts` implementa papéis e CSRF.

### Dependências e restrições de entrega

A configuração corrente tem Server e Database ativos, Preview na porta 3000, TypeScript registrado em diagnósticos e `publishing.auto_publish=false`. A mudança será validada com os comandos existentes (`pnpm check`, `pnpm test`, `pnpm build`); não publicar o site. Ao terminar e revisar o esquema, criar um commit em `main` e empurrar ao remoto canônico para salvar checkpoint; atualizar também o espelho público GitHub já autorizado, omitindo `.manus-starter-init.json` e outros metadados internos.


## Correção de confiabilidade — login, logout, impressão e dados persistidos (21/11/2026)

### Abordagem e diagnóstico confirmado

Preservar React 19, TypeScript, Vite, Express/tRPC, Drizzle/MySQL, Wouter, identidade visual, contas e registros; corrigir apenas os caminhos existentes. A consulta read-only ao banco confirmou que há registros de fechamento persistidos, mas o procedimento real `closures.list` falha com `ER_BAD_FIELD_ERROR: Unknown column 'closures.revision' in 'field list'`. A coluna é acrescentada por `drizzle/0002_inventory_discrepancies.sql`; a conferência dos hashes do diário real confirmou `0000_initial_users` e `0001_smiling_electro` aplicadas, com `0002_inventory_discrepancies` e `0003_payroll_review_revisions` pendentes. O frontend confunde erros de consulta com listas vazias e zeros, agravando o sintoma. Nenhuma migração ou escrita de banco foi executada.

Antes de qualquer DDL, manter o banco compartilhado intacto e pedir aprovação explícita para aplicar as migrações pendentes somente após backup privado verificável. `0002` cria oito tabelas operacionais e adiciona `closures.revision`; `0003` altera o índice de unicidade de `payrollAdjustmentReviews` e acrescenta `closureRevision`. Não recriar tabelas, apagar/limpar dados, inserir amostras, trocar banco ou recriar contas. Se a migração não for autorizada, a aplicação deve mostrar falha real de serviço/esquema com tentativa de reconsulta, nunca simular ausência de dados.

### Implementação mínima

- Login: botão com o rótulo exato “Entrar”, contraste e largura estáveis em celular e desktop; durante envio, manter texto (“Entrando…”) e spinner visível, sem deixar o botão vazio.
- Logout: revogar no servidor a sessão identificada por `ctx.session` (inclusive quando autenticada por Bearer), limpar o cookie e, só após sucesso, remover CSRF e todo o cache privado do cliente; pedir confirmação antes de sair. Redirecionar por substituição do histórico para `/login`, proteger o app em cada URL direta e revalidar páginas restauradas pelo botão Voltar sem expor conteúdo protegido. Falha de logout não deve apagar a credencial local nem fingir sucesso.
- Impressão: substituir a ficha resumida atual por uma impressão A4 responsiva construída exclusivamente a partir do detalhe persistido: estabelecimento/razão social, CNPJ/endereço, data/turno, frentista e responsável; linhas dos bicos com leituras, litros, preço e valor; totais por combustível/vendas, recebimentos por modalidade, total recebido, diferença, resultado, observações, confirmações e horários. Usar quebra de página e estilos de impressão para evitar cortes, sobreposição ou interface do app; escapar texto dinâmico. O PDF/compartilhamento existente permanece separado.
- Dados: separar loading, sucesso vazio e erro em histórico, detalhe, dashboard, relatórios, divergências, estoque e listas administrativas; oferecer retry e não renderizar zeros/“nenhum registro” durante falha. Propagar falha de infraestrutura de autenticação em vez de convertê-la em sessão ausente. Revisar filtros/permissões e retirar o limite silencioso do histórico com paginação/continuação segura, preservando o escopo por unidade e por perfil.
- Privacidade de sessão: impedir cache HTTP de respostas tRPC e limpar/revalidar a página restaurada do BFCache após navegação, mantendo a validação de sessão no servidor.

### Estrutura e entrega

Reutilizar `client/src/pages/AuthPage.tsx`, `client/src/_core/hooks/useAuth.ts`, `client/src/App.tsx` e `client/src/pages/Home.tsx`; acrescentar, se útil, um gerador isolado de HTML de impressão e um componente reutilizável de erro/retry. Ajustar `server/routers.ts`, `server/_core/appAuth.ts`, `server/_core/context.ts` e `server/_core/index.ts` sem mudar a arquitetura. Testes automatizados usam fixtures/mocks e não fazem mutações ao banco real. Rodar diagnósticos TypeScript, testes e build. Não publicar; salvar commit somente no fluxo canônico já autorizado e preservar o espelho GitHub sem metadados internos.

### Evidências e pendências registradas (21/11/2026)

No Preview, login inválido exibiu “Usuário ou senha incorretos.” e o usuário entrou com uma conta existente. O logout, disparado pelo botão no DOM porque a camada do Preview interceptou o clique visual, percorreu a confirmação afirmativa, redirecionou a `/login` e foi confirmado pelo backend: `auth.me` retornou HTTP 401 / `UNAUTHORIZED`. A confirmação negativa manteve a sessão ativa; acesso direto a `/historico` e Voltar após logout permaneceram na tela de login. O login foi conferido visualmente em desktop e viewport móvel; o fluxo autenticado responsivo em Android físico ainda não foi inspecionado.

Os testes isolados da impressão validam conteúdo e escape HTML, mas não substituem imprimir um fechamento real. Essa verificação, a leitura de dados após novo login e o aceite integrado permanecem bloqueados porque `closures.revision` não existe no esquema compartilhado; as migrações `0002` e `0003` não foram aplicadas, e nenhum DDL ou escrita foi executado. `pnpm check`, `pnpm test` (27 testes), `pnpm build` e `git diff --check` passaram; o build reportou apenas avisos já observados de chunk grande e script existente no `index.html`. `publishing.auto_publish=false` e o site não foi publicado.


## Revisão geral do código — limpeza conservadora (22/11/2026)

### Abordagem

A auditoria somente de leitura foi dividida em sete áreas: páginas/rotas do cliente; componentes/contextos; bibliotecas/hooks/testes; backend; lógica compartilhada; estilos/componentes UI; e configuração/dependências/ativos. A implementação deve remover apenas módulos ou símbolos sem consumidores comprovados no repositório, simplificar duplicações cuja equivalência foi verificada e formatar o código fonte com o Prettier já disponível. Não fazer uma reescrita arquitetural ampla nem alterar contratos tRPC, autenticação/autorização, transições de fechamento, estoque, divergências, auditoria, fórmulas ou dados persistidos.

Preservar os fluxos ativos e os testes existentes. O login próprio não usa OAuth da plataforma; SDK, tipos e codificadores/decodificadores OAuth sem consumidor local foram removidos. O módulo heartbeat/cron permanece até verificar possíveis schedules externos. Uploads e notificação ao proprietário continuam ativos e serão mantidos até substituição/decisão funcional. Não apagar o backup local ignorado `vite.config.ts.bak`. Nenhuma migração, alteração ou consulta com escrita no banco faz parte desta revisão.

### Organização atual observada

- `client/src/App.tsx` controla a sessão; `client/src/pages/Home.tsx` contém o shell/navegação e os fluxos operacionais ativos; as demais páginas conectadas são importadas pelo fluxo do cliente.
- `client/src/components/` e `client/src/components/ui/` reúnem peças compartilhadas; manter os componentes efetivamente importados, como `ErrorBoundary`, `QueryError` e `TankStockOverview`. O chat de demonstração `AIChatBox` não tinha consumidor e foi removido.
- `client/src/lib/`, `client/src/hooks/` e `client/src/contexts/` concentram impressão/PDF, exportação, rascunho offline, cliente tRPC, hooks e tema.
- `server/routers.ts`, `server/routers/`, `server/db.ts` e `server/_core/` implementam tRPC, autorização, persistência e runtime legado; `server/storage.ts` e helpers sem consumidores locais foram removidos.
- `shared/` contém regras puras de data de negócio, rateio, estoque, folha, erros e constantes; `drizzle/` mantém o esquema e migrações.
- `client/src/index.css` é a folha global e o código-fonte inclui módulos de demonstração não conectados. O plano de design e os requisitos de negócio permanecem inalterados.

### Entrega e limites

Formatar somente fontes/configurações do aplicativo, remover arquivos/helpers/dependências sem uso local confirmado, consolidar a ordenação administrativa de divergências sem mudar critérios, e remover seletor/declarações de estilo comprovadamente ineficazes. Validar com `pnpm check`, `pnpm test`, `pnpm build` e `git diff --check`; usar revisão read-only final. Na etapa atual de migração não criar commit nem fazer push. Não publicar o site nem tocar no banco.


## Migração de infraestrutura — diagnóstico e plano técnico (22/11/2026)

### Estado e abordagem

A solicitação para Cloudflare Workers, PostgreSQL Neon, Hyperdrive e R2 inicia uma etapa de infraestrutura sem mudar as funcionalidades ou regras existentes. O diagnóstico está registrado em [`RELATORIO-MIGRACAO-CLOUDFLARE.md`](RELATORIO-MIGRACAO-CLOUDFLARE.md). O repositório público novo `leosampaiou/j-sampaio-postos-cloudflare` permanece isolado, e o trabalho segue exclusivamente em `/home/ubuntu/jsampaio-cloudflare`. O usuário confirmou staging apenas no Free Tier, banco PostgreSQL novo e vazio, R2 novo e vazio, Worker exclusivo de staging e preferência por `aws-sa-east-1` (São Paulo). Nenhum dado, usuário, senha, histórico ou objeto do MySQL/Manus será importado; a aplicação antiga e seus serviços permanecem intactos.

Não alterar produção, DNS, MySQL original ou armazenamento Manus original; não contratar/ativar plano pago, não fazer commit/push e não publicar em produção. Preservar todas as capacidades funcionais na adaptação técnica. Se uma configuração exigir autorização adicional ou puder gerar cobrança além do Free Tier, interromper a etapa afetada e pedir aprovação expressa.

### Arquitetura de destino recomendada

- Manter a SPA React, Vite, identidade, páginas, PWA, contratos tRPC e regras de negócio. Publicar `dist/public` como Workers Static Assets e executar a API no Worker por um handler Fetch. Converter o adaptador tRPC Express para o adaptador Fetch/Edge, preservar os procedimentos e adaptar o contexto, cookies, CSRF e cabeçalhos. Não iniciar um servidor Node persistente com `listen()` dentro do Worker.
- Usar Drizzle `pg-core`, driver `pg` e PostgreSQL gerenciado com binding Cloudflare Hyperdrive. O projeto Neon `j-sampaio-postos-staging` (ID `quiet-shape-50609797`) foi criado em `aws-sa-east-1`, no plano Free, com compute fixo de 0,25 CU e cotas de compute ativo/transferência/tamanho para evitar ultrapassar as franquias. Converter schema, migrações e cada query: IDs via `RETURNING`, upserts via `ON CONFLICT`, timestamps e enums PostgreSQL; preservar centavos inteiros, precisão decimal dos litros, constraints, locks e transações.
- Representar instantes absolutos como `timestamptz` e datas operacionais com semântica explícita de calendário local do posto. Não haverá carga nem conversão de timestamps do MySQL antigo. Preservar o comportamento de `ON UPDATE CURRENT_TIMESTAMP` de MySQL por trigger PostgreSQL para todos os `updatedAt` equivalentes.
- Usar o banco PostgreSQL vazio para dados novos. Portar a autenticação, sessão e permissões existentes, mas não copiar usuários, hashes de senha ou sessões do legado; o fluxo `auth.bootstrap` atual já exige `INITIAL_ADMIN_SETUP_KEY` no servidor e deve ser adaptado/testado no Worker sem credencial padrão. Revisar os bicos/preços padrão que o bootstrap hoje cria. Injetar `HYPERDRIVE`, `R2` e secrets pelo ambiente do Worker. Preservar scrypt para novas senhas e medir CPU/autenticação no runtime de staging; trocar rate limit em memória por limitação compartilhada. Não enfraquecer segurança para adequar a limites gratuitos.
- Usar bucket R2 privado para comprovantes e evidências, preservando associação lógica com os registros e controle de acesso por usuário/perfil. Validar formato e tamanho, e manter upload/download autorizados. URLs pré-assinadas podem apoiar upload direto, desde que curtas, restritas e geradas por signer compatível; não expor credenciais ou tornar o bucket público.
- Substituir integrações Manus realmente chamadas por alternativas compatíveis antes de removê-las. Upload de comprovantes/evidências via Forge e a rota `system.notifyOwner` estão registradas e permanecem preservadas até R2 e uma decisão de notificação substituí-las. SDK/tipos/helpers OAuth e helpers sem consumidores locais foram removidos após auditoria; heartbeat/cron continua no clone até verificar schedules e dependências externas da conta.

### Sequência de implementação planejada

1. Manter toda implementação na cópia isolada, sem commit/push ou alteração do repositório público até revisão final.
2. Adaptar o handler Fetch, tRPC, autenticação, consultas, bindings e assets para Workers, preservando fluxos de produto e removendo somente componentes de plataforma comprovadamente sem consumidores.
3. Converter schema e consultas para PostgreSQL/Hyperdrive; criar apenas banco vazio e aplicar o DDL/schema candidato nele, sem importar dados legados. Preservar centavos, precisão de litros, relações, constraints, transações, locks, permissões, autenticação e CSRF, sem copiar contas ou hashes antigos.
4. Conectar um bucket R2 novo, privado, Standard e vazio; não copiar nem consultar objetos do armazenamento Manus antigo.
5. Preparar apenas recursos de staging Free: organização Neon Free, região São Paulo se suportada, Hyperdrive, bucket R2 e Worker separado. Secrets permanecem fora do Git.
6. Testar as funcionalidades no runtime real de Workers com dados temporários de teste, verificando integração PostgreSQL/R2, autenticação, limites e custo zero observado.
7. Documentar o setup e os resultados do staging. Produção, DNS, plano pago, commits e pushes exigem autorização separada; importar dados ou arquivos do sistema antigo está fora do escopo e não será feito.

### Limites e estrutura do projeto

O plano Free de Workers publica limites de requests, CPU e memória; Hyperdrive também tem cota diária gratuita. O R2 possui franquias mensais para armazenamento e operações e cobra uso acima delas. Neon Free anuncia limites por projeto e não inclui recursos de recuperação/SLA equivalentes aos planos pagos. Essas cotas mudam e não provam adequação para produção; a escolha deve considerar carga real, backup e continuidade operacional. Os valores e fontes oficiais consultados constam no relatório de diagnóstico.

A estrutura atual continua como base: `client/` permanece com SPA e ativos; `shared/` mantém tipos e regras puras; `server/routers.ts` e `server/routers/` preservam domínios tRPC, mas recebem contexto Fetch e bindings; `server/db.ts` e o schema ativo migram para PostgreSQL em conjunto. Enquanto consultas e driver ainda forem MySQL, `drizzle/schema.ts` permanece ativo e `drizzle/schema.pg.ts` serve apenas como candidato de conversão isolado e validado pelo TypeScript. `drizzle/` passa a conter migrações PostgreSQL versionadas para a estrutura vazia; novo entrypoint Worker configura roteamento API/assets; Wrangler documenta bindings de assets, Hyperdrive e R2; o `README.md` descreve setup seguro, sem scripts de importação legada. O Dockerfile legado, que iniciava um entrypoint Node inexistente e não representa Workers, foi removido; não há necessidade de Docker no alvo.

### Estado dos recursos e bloqueios de staging

O usuário definiu que o PostgreSQL e o R2 novos começam vazios; não há export do MySQL nem de arquivos a solicitar. Os conectores Cloudflare Worker Bindings e Neon foram autorizados e habilitados; após autorização explícita, o conector Cloudflare API também foi habilitado para Worker/Hyperdrive de staging. O projeto Neon `j-sampaio-postos-staging` (`quiet-shape-50609797`) foi criado em organização Free e região São Paulo; está sem schema e sem dados de aplicação, com compute 0,25 CU e cotas Free configuradas. O Free aplica scale-to-zero padrão em cinco minutos; alterar o intervalo não é permitido no plano. As leituras da API Cloudflare retornaram uma conta e nenhuma configuração de Worker ou Hyperdrive; `/user/tokens/verify` retornou HTTP 401, mas o usuário informa que o token tem acesso total. A chamada de inventário R2 anterior retornou erro 10042; o usuário confirmou que habilitou R2 manualmente sem upgrade e a listagem atual retorna zero buckets. Nenhuma escrita ou criação remota foi tentada; nenhum recurso Cloudflare foi criado. Após a conversão funcional, limitar criações ao staging Free e interromper se surgir permissão insuficiente, upgrade ou custo; não armazenar credenciais no Git.


## Atualização da implementação local — 22/11/2026

A seção de implementação abaixo registra o estado mais recente e prevalece sobre descrições históricas anteriores que ainda tratavam os routers como exclusivamente MySQL.

- `server/_core/context.ts` entrega `ctx.db` PostgreSQL por `HYPERDRIVE.connectionString` ou `PG_DATABASE_URL` no adaptador de desenvolvimento. `DATABASE_URL` não é fallback; há teste de regressão para essa fronteira.
- Autenticação/sessões (`appAuth.ts`/`db.pg.ts`), routers principal, estoque e divergências e `closureIntegrations.ts` estão ligados ao schema PostgreSQL candidato. Insert IDs usam `RETURNING`; upserts usam `ON CONFLICT` com alvo explícito. O `server/db.ts` MySQL não tem uso pelos routers ativos e permanece apenas como referência.
- Validação local mais recente: `pnpm check`, `pnpm test` (51 testes/14 arquivos), Prettier dos TypeScript alterados, `pnpm build`, Wrangler dry-run e smoke HTTP local passaram. A API continua atrás de `TRPC_ENABLED=true` e de binding PostgreSQL; por padrão `/api/trpc` responde 503. Nenhuma query de negócio foi executada contra Neon; os checks locais não comprovam locks, transações ou equivalência do runtime.
- O Neon permanece sem schema/dados. R2 está habilitado, mas vazio; Forge/evidências e verificação de heartbeat/schedules externos seguem pendentes. `system.notifyOwner` foi desativada por decisão do usuário e não envia mensagens até ser escolhido um canal independente. A documentação Cloudflare dá suporte a Node crypto na compatibility date atual; custo de scrypt e login em Worker permanecem por testar.
- A revisão identificou riscos de atomicidade, concorrência e limites numéricos ainda não resolvidos. Foram corrigidos localmente o volume mínimo, a validação de datas civis nos inputs de fechamento/filtros e o teto de valor aprovado em transições posteriores; esses ajustes passaram pelos testes unitários, mas ainda não foram validados em PostgreSQL/Worker conectado.
- Próxima sequência: corrigir e testar riscos de concorrência/atomicidade, validar `numeric`, locks, idempotência e transações; manter tRPC desativado; implementar upload/download autenticados no R2 e verificar heartbeat/schedules. Manter a notificação desligada até decisão do usuário. Só depois considerar conexão de staging, Hyperdrive e DDL no Neon vazio, exclusivamente Free.

Nenhuma escrita remota, DDL, deploy, alteração de DNS/produção, commit/push ou uso de banco/armazenamento antigo ocorreu.
