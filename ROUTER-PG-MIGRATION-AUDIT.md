# Auditoria técnica: migração MySQL → PostgreSQL/Workers

**Escopo:** routers tRPC e dependências descritos no inventário estático fornecido.  
**Base da análise inicial:** inventário estático e achados por domínio fornecidos antes da conversão dos routers. Essa fotografia descreve o estado anterior do código; a atualização de implementação abaixo registra o progresso posterior. Nenhum banco ou serviço externo foi acessado.

## Síntese executiva

O inventário inicial registra **10 routers e 50 procedures estáticas** em 10 domínios. Naquele snapshot, os routers usavam `server/db.ts` e `drizzle/schema.ts` (MySQL), enquanto o Worker retornava `503 MIGRATION_INCOMPLETE` para `/api/trpc`.

A migração, portanto, não é apenas uma troca de DSN. Ela requer integrar o provider PostgreSQL ao contexto de requisição do Worker e adaptar usos MySQL específicos — retorno `insertId`, upserts, schema/tipos, transações, locks, timestamps e autenticação. Regras funcionais já implementadas devem ser preservadas, em especial autorização/CSRF, isolamento por unidade, estados e histórico dos fechamentos, integração de estoque e divergências, idempotência e trilha de auditoria.

**Domínios falhos:** o campo fornecido `Falhas: []` não lista nenhum domínio como falho. Isso não comprova que os domínios funcionem no ambiente PostgreSQL/Workers; descreve somente ausência de falhas reportadas no inventário.  
**Procedures sem cobertura no inventário:** nenhuma (`uncoveredProcedures: []`). A cobertura de procedures pelo inventário não equivale a cobertura por testes automatizados; vários resultados registram testes de router ausentes ou não localizados.

**Atualização local posterior (22/11/2026):** `server/_core/context.ts` injeta `ctx.db` PostgreSQL via Hyperdrive ou `PG_DATABASE_URL` de desenvolvimento; auth/sessões usam esse DB explicitamente. Os routers principal, estoque e divergências, mais `closureIntegrations.ts`, passaram a importar `drizzle/schema.pg.ts` e usar o banco do contexto. `insertId` foi substituído por `RETURNING`; upserts foram convertidos para `ON CONFLICT` com os alvos únicos do schema PG. Nenhum router ativo referencia `getDb()`/`server/db.ts`, que permanece como referência MySQL sem consumidores. O Worker agora está ligado ao adapter tRPC Fetch, protegido por `TRPC_ENABLED=true` e binding PostgreSQL; por padrão `/api/trpc` permanece em 503. `pnpm check`, `pnpm test` (39 testes em 11 arquivos), Prettier, Wrangler dry-run e smoke test local passaram, sem execução de queries de negócio nem conexão Neon/Hyperdrive.

## Achados transversais e riscos de migração

- **Adapter e schema desconectados:** os routers apontam para `server/db.ts`/`drizzle/schema.ts` (MySQL). O helper PostgreSQL `server/db.pg.ts`, baseado em postgres-js e binding Hyperdrive, e `schema.pg.ts` existem em paralelo, mas não são usados pelos módulos auditados. `drizzle/relations.ts` não declara relações. Deve haver seleção/injeção explícita do banco e uso coerente do schema PostgreSQL, sem misturar objetos de dialetos.
- **Runtime Worker não pronto no caminho tRPC:** conforme os resultados, `worker/index.ts` declara apenas `ASSETS` e responde 503 em `/api/trpc`; não chama o contexto tRPC nem encaminha Hyperdrive. `RuntimeBindings` menciona Hyperdrive em parte do código, mas o caminho auditado não o conecta ao provider dos routers. Não presumir que o helper PG isolado prove integração operacional.
- **Configuração de ambiente:** código MySQL depende de `process.env.DATABASE_URL`; o provider PG recebe `binding.connectionString`. `MANUS_API_URL` e `MANUS_API_KEY` não aparecem entre os bindings de Worker descritos, e `INITIAL_ADMIN_SETUP_KEY` também precisa chegar ao contexto de bootstrap de forma segura. Planejar bindings/contexto explicitamente, sem expor segredos.
- **Diferenças de dialeto:** revisar `insertId` para `RETURNING`, `.onDuplicateKeyUpdate()` para `.onConflictDoUpdate()` com alvo explícito, `mysqlEnum`/`mysqlTable` para equivalentes PG, tipos de IDs e retorno, e tratamento de erros/constraints. Não presumir equivalência de mensagens ou erros MySQL/PostgreSQL.
- **Transações e concorrência:** preservar transações existentes e verificar `.for('update')`, isolamento, concorrência em bootstrap, idempotência de movimentos/recebimentos e unicidades. Há operações de negócio/auditoria hoje separadas, cujo eventual agrupamento em transação pode mudar comportamento em falhas parciais; tratar como decisão deliberada, não como efeito colateral da migração.
- **Tipos, datas e ordenação:** conferir `numeric` e sua possível representação string pelo driver, timestamps com timezone, triggers `updatedAt`, datas de fechamento armazenadas como texto ISO e ordenação/filtros dependentes de collation. Não alterar precisão, arredondamento, limites inclusivos ou semântica de fuso sem teste de paridade.
- **Autenticação no runtime:** a autenticação usa `node:crypto`, `Buffer`, scrypt, comparação em tempo constante e cookie. A configuração citada tem comentário sobre crypto, mas não comprova compatibilidade completa do Worker nem flag `nodejs_compat`. A limitação de login é um `Map` local, não um contador compartilhado entre isolates. Validar ambos antes do cutover.
- **Dados e migrations:** os resultados são estáticos e não validam dados, collation efetiva, constraints implantadas, cadeia de migrations, estado de produção, bindings ou deployment. Planejar migração de dados, preservação de IDs/referências e validação em ambiente isolado autorizado; não concluir que a migration baseline PG já está aplicada.

## Auditoria por domínio

### Sistema e notificações (`system`)

**Procedures:** `system.health`, `system.notifyOwner`.

**Regras a manter:** `health` é público, exige timestamp numérico não negativo, ignora seu valor e retorna exatamente `{ok:true}` quando válido. `notifyOwner` exige administrador autenticado e CSRF válido; valida e normaliza título/conteúdo e limites atuais; envia apenas `{title, content}` ao serviço configurado. Resposta upstream ok resulta em `success:true`; falha upstream/de rede retorna `success:false` com warning; ausência de URL/chave gera erro interno. Não há persistência de notificações demonstrada.

**Riscos:** apesar de não consultar tabelas diretamente, autenticação contextual pode chamar `findSession` no caminho MySQL quando há credencial. Variáveis do serviço não estão descritas como bindings Worker; autenticação adjacente depende de crypto Node cuja compatibilidade não foi comprovada. Não inferir timeout, retry ou semântica adicional do serviço.

**Testes necessários:** limites e tipos de `health`; chamada com/sem credencial; autorização/CSRF; trim, limites exatos e erro de input; URL, método, headers e corpo do fetch; sucesso, HTTP não-ok, falha de rede e configuração ausente; ausência de vazamento da chave; sessão no adaptador PostgreSQL. Testar URL base com/sem barra final.

### Autenticação e sessões (`auth`)

**Procedures:** `auth.status`, `auth.bootstrap`, `auth.login`, `auth.me`, `auth.logout`.

**Regras a manter:** status depende da existência de qualquer usuário, não de `bootstrapComplete`. Bootstrap requer chave configurada e comparada em tempo constante, valida os campos, normaliza username, cria unidade/admin/seeds em transação e depois cria sessão. Login normaliza username, mantém senha sem trim, permite somente usuário ativo com hash scrypt válido e retorna falha genérica; inexistente/inativo usa hash fictício. Sessões persistem apenas SHA-256 do token aleatório, expiram em 12h, são invalidadas por revogação/expiração/usuário inativo e aceitam cookie ou Bearer (cookie prevalece). CSRF é exigido por mutations protegidas. Logout revoga sessão corrente e só limpa cookie após sucesso. Preservar shape público sem `passwordHash`, flags de cookie, formatos, parâmetros e comparação em tempo constante.

**Riscos:** imports diretos de `server/db.ts` mantêm o caminho MySQL; bootstrap lê `insertId`; PostgreSQL precisa de `RETURNING`. O singleton de bootstrap não é garantido contra chamadas concorrentes pelo código descrito. O `Map` de rate limit é local ao processo/isolate. Verificar unicidade/collation histórica de username, timestamps/fuso e suporte do Worker a scrypt, `Buffer` e crypto. O Worker não está ligado ao handler tRPC no resultado fornecido.

**Testes necessários:** status vazio/preenchido; bootstrap com chave e entradas válidas/inválidas, atomicidade e concorrência; falhas parciais; login ativo/inativo/desconhecido, formatos de hash, limites, senha com espaços e rate limit/IP; sessão por cookie/Bearer, precedência, expiração, revogação e conta inativa; payload de `me`; CSRF e logout inclusive falha no banco/cookie; teste de binding/contexto, `RETURNING`, transação e crypto no runtime alvo. Estender os testes focados existentes indicados nos resultados.

### Cadastro e consulta de funcionários (`employees`)

**Procedures:** `employees.list`, `employees.participantOptions`, `employees.create`, `employees.setActive`.

**Regras a manter:** escopo por unidade e visibilidade por papel; frentista vê apenas funcionários vinculados a si; `participantOptions` lista somente ativos. Criação aparada cria ativo e audita; `setActive` pode repetir estado, retorna `NOT_FOUND` fora da unidade e audita mesmo sem transição. Desativação preserva registro/histórico; não há exclusão. `linkedUserId` é nullable e não único no schema descrito. Alteração e auditoria não são transacionais atualmente.

**Riscos:** `insertId` em criação; schema MySQL e `getDb()` desconectados do provider PG. PostgreSQL depende de trigger ou lógica para atualização de `updatedAt`; ordenar nomes pode mudar por collation. Não acrescentar unicidade, desvinculação ou novas garantias transacionais sem decisão funcional.

**Testes necessários:** autorização/CSRF; isolamento de unidade e filtro por vínculo; ativos/inativos e shape de participant options; trim/limites de nome, unidade/estado inicial/ID retornado; eventos de auditoria inclusive repetição de estado; `updatedAt` após alteração; comparação de ordenação com acentos/caixa; conexão por binding e comportamento do insert PG.

### Contas e gestão de usuários (`users`)

**Procedures:** `users.list`, `users.create`, `users.setActive`.

**Regras a manter:** somente administrador autenticado e CSRF válido nas mutations; listagem da unidade sem hash de senha. Criação valida e normaliza username, valida nome/senha/papel, associa conta à unidade do administrador e, opcionalmente, a funcionário ativo, não vinculado e da mesma unidade. Desativação própria é proibida; desativar alvo da mesma unidade revoga sessões ativas; reativar não restaura sessões. Auditoria é emitida. O código não impede desativar último administrador nem exige justificativa; não inventar essas regras.

**Riscos:** caminho atual MySQL, `insertId`, enums/IDs e dependência de auth/db precisam ser portados. Verificar unicidade global de username e collation/dados existentes. Transações poderiam mudar a semântica de falhas parciais em criação, vínculo, auditoria e revogação. O tratamento atual de erros não-TRPC de criação como conflito pode mascarar outras falhas; qualquer ajuste é mudança de comportamento.

**Testes necessários:** papéis/CSRF e isolamento; shape sem hash, ordenação; validações e hash; criação com/sem funcionário e rejeições; duplicidade com variação de caixa/unidade; auto-desativação, revogação de sessões e reativação; auditoria e chamadas repetidas; constraints/FKs, `RETURNING`, transação e binding Worker.

### Unidade, preços e bombas (`settings`)

**Procedures:** `settings.get`, `settings.update`, `settings.pumps`.

**Regras a manter:** consultas por unidade autenticada; update exclusivo de administrador. `get` usa preços mais recentes por combustível e tolerância, com zero em ausências. `update` valida centavos/tolerância entre 0 e 100000, trims e limites dos campos, grava estado em maiúsculas e valida CNPJ somente por comprimento. Grava unidade, dois novos registros históricos de preço e upsert de tolerância em transação; auditoria ocorre depois. `pumps` lista bombas ativas ordenadas e preço correspondente ou zero. Bootstrap cria quatro bombas e seeds iniciais; os resultados não afirmam que isso seja regra permanente de alterações.

**Riscos:** `.onDuplicateKeyUpdate()` precisa de upsert PG com conflito explícito `(unitId, settingKey)`. Verificar triggers `updatedAt`, timestamps e desempate inexistente quando `effectiveAt` empata. Não acrescentar validação fiscal/comercial não presente.

**Testes necessários:** permissões/isolamento; defaults e escolha de preço por tipo; limites, trim e comportamento atual do CNPJ; dois registros históricos e upsert repetido sem afetar outras chaves; rollback da transação e falha posterior da auditoria; bombas ativas, ordenação, combustível e preço; conflitos concorrentes, timestamps e Hyperdrive.

### Fechamentos de turno (`closures`)

**Procedures:** `closures.list`, `closures.listPage`, `closures.detail`, `closures.saveDraft`, `closures.finalize`, `closures.confirm`, `closures.reopen`.

**Regras a manter:** escopo de unidade, visibilidade e mascaramento por papel, filtros/status e limites/paginação; unicidade por unidade/data/turno; formato textual `YYYY-MM-DD` e turnos existentes. Preservar validação de funcionário/participantes, rateio, leituras, pagamentos, cálculo de litros/preço snapshot/arredondamento, tolerância capturada, estados e revisão. Rascunhos/reabertos são editáveis nas condições atuais; fluxo de frentista pode aguardar conferência, gerência confirma/finaliza; administrador reabre com motivo. Manter eventos de auditoria e sincronização transacional com estoque/divergências, incluindo compensações, locks e histórico.

**Riscos:** router e integração usam schema/provider MySQL; `insertId`, upserts correlatos, triggers, locks `.for('update')`, numeric/string, timezone e constraints devem ser validados no PG. `closureDate` é texto ISO, não converter implicitamente para DATE. Cálculo da migração precisa preservar IDs e relações com funcionários, bombas, preços, pagamentos, participantes, estoque e divergências. Não há comprovação de que o baseline PG esteja implantado.

**Testes necessários:** segurança/visibilidade multiunidade; listagem/paginação e filtros; validações de participantes, bicos, pagamentos e data; arredondamento/cálculos/diferenças; unicidade concorrente; ciclo de estados e condições de transição; edição/revisão/auditoria/rollback; integração de estoque e divergências em finalização/correção; integração PG para `RETURNING`, numeric, enums, timezone, cascatas, constraints, locks e transações.

### Indicadores e relatórios (`analytics`)

**Procedures:** `analytics.dashboard`, `analytics.report`.

**Regras a manter:** gerente/admin, escopo por unidade. Métricas de venda usam fechamentos finalizados. Data de negócio do dashboard é `America/Sao_Paulo`. Apesar dos nomes `month*`, sem filtros os agregados usam hoje; filtros `from`/`to` têm limites inclusivos e fallbacks atuais, enquanto os campos `today*` independem deles. Preservar contagens/status, soma de sobra/falta/líquido, três turnos e relatório que inclui todos os status, nome via left join/fallback e ordenação por data decrescente.

**Riscos:** queries são majoritariamente operadores Drizzle portáveis, mas o router ainda usa provider/schema MySQL. `closureDate` é varchar ISO e depende de ordenação lexical. PostgreSQL numeric para litros pode vir como string; garantir conversão sem alterar agregados. Ordenação não define desempate; não acrescentar sem aprovação.

**Testes necessários:** permissões e isolamento; janelas padrão, filtros parciais/inclusivos/invertidos; virada de data São Paulo; métricas por combustível/pagamento; status incluídos/excluídos; divergências e saldo líquido; relatório/fallback/ordenação; fixture idêntica MySQL/PG e teste de representação numeric.

### Estoque de combustíveis (`inventory`)

**Procedures:** `inventory.dashboard`, `inventory.listTanks`, `inventory.createTank`, `inventory.updateTank`, `inventory.assignPump`, `inventory.createReceipt`, `inventory.receiptUploadTarget`, `inventory.attachReceiptDocument`, `inventory.recordMeasurement`, `inventory.recordWriteoff`, `inventory.movements`, `inventory.measurements`.

**Regras a manter:** gerente/admin nas operações usuais e administrador em cadastro/edição de tanque/atribuição; CSRF nas mutations e escopo por unidade. Preservar validações e arredondamento milésimo, movimento opening, capacidade/saldo, atribuição por combustível, idempotência de recebimento/baixa, nota única conforme regra, medições sem ajuste automático, baixa negativa e auditoria. Manter integração de fechamento: ausência de tanques conserva fluxo anterior; quando há tanques, validar atribuição/compatibilidade, locks ordenados, data inicial e deltas por revisão. Preservar cálculo/alertas/dashboard, histórico de movimentos e limites de medição. Upload aceita tipos/tamanho informados, gera chave escopada e valida prefixo conforme implementação.

**Riscos:** router usa MySQL; `insertId` e `onDuplicateKeyUpdate` requerem adaptação. Manter `FOR UPDATE`, atomicidade, idempotência sob concorrência e triggers de atualização. Tipos numéricos, timestamp/filtros sem offset explícito, timezone e collation de códigos/notas devem ser testados. Upload depende atualmente do serviço Forge; `R2` no contexto não demonstra substituição equivalente. Não acessar serviço real durante teste.

**Testes necessários:** permissões/CSRF/unidade; cadastro/edição/atribuição; limites e concorrência de recebimentos/notas/baixas; medição e não alteração de saldo; finalização/revisão/rollback/locks; dashboard e alertas; saldo cumulativo, filtros/timezone/ordem/limite; uploads com mocks para MIME/tamanho/chave/prefixo/erros. Os resultados apontam testes compartilhados de cálculo/data, mas não testes de procedures de router localizados.

### Divergências, rateios e revisão de folha (`discrepancies`)

**Procedures:** `discrepancies.backfillHistorical`, `discrepancies.list`, `discrepancies.employees`, `discrepancies.employeeSummary`, `discrepancies.monthlySummary`, `discrepancies.monthlyTrend`, `discrepancies.updateAnalysis`, `discrepancies.evidenceUploadTarget`, `discrepancies.adjustments`, `discrepancies.createAdjustmentReview`, `discrepancies.setAdjustmentStatus`.

**Regras a manter:** escopo por unidade e autorização por procedure. Backfill considera fechamentos finalizados com sobra/falta sem ocorrência, usa magnitude, revisão e notas, e documenta que não realiza desconto. Preservar algoritmo de rateio em centavos, ordem e desempate por ID; sincronização/revisões reabrem análise quando valores/tipo/revisão/rateio mudam, cancelam sem apagar histórico quando desaparece divergência e trabalham por revisão. Manter visibilidade reduzida de frentista pela alocação atual, regras de resumos/mês/tendência, validação e lock de `updateAnalysis`, escopo/chave de upload, condições de criação e máquina de transições de revisão de folha. Aprovação não executa desconto automático.

**Riscos:** router e integração ainda dependem de schema/provider MySQL. Migrar `insertId`, upsert de alocações para `onConflictDoUpdate` no alvo composto, transações, locks, triggers e timestamps. Preservar histórico por revisão e constraints compostas. Datas mensais são strings; há diferenças de limites e formatos a manter/testar. Upload usa configuração/serviço Forge, não R2 automaticamente. Não inferir estado real do destino ou política legal/operacional de folha.

**Testes necessários:** rateio e centavos residuais; backfill idempotente/concor­rente; sincronização/correção/cancelamento com histórico; autorização/isolamento e visibilidade; filtros/lista e agregados por revisão/status/mês; edição concorrente de análise; upload por mocks; matriz completa de status de folha sem desconto; PG para `RETURNING`, upsert composto, FKs, enums, transações, locks, numeric e timestamps.

### Auditoria de alterações (`audit`)

**Procedures:** `audit.list`.

**Regras a manter:** apenas administrador, escopo unitId, `innerJoin` do ator, projeção de evento/username/fullName, ordem `createdAt` decrescente e limite de 300. Preservar nomes, nulabilidade, defaults, FK e índices de `auditEvents`. A tabela representa alvo polimórfico sem FK para alvo/catálogo tipado. Preservar dados históricos, ações, campos, valores e motivos produzidos pelos demais domínios. Há operações que escrevem auditoria dentro de transação e outras após commit; não uniformizar sem decisão explícita.

**Riscos:** endpoint usa MySQL/schema atual. Mesmo que a consulta seja portável, os escritores também precisam ser migrados e adaptados nos retornos de ID/upserts. Ordem para timestamps iguais não é definida. O join exclui ator inexistente, embora FK declarada normalmente impeça esse caso; dados reais não foram validados.

**Testes necessários:** autorização e isolamento; limite de 300 e shape, campos nulos/preenchidos, timestamps empatados sem exigir ordem não especificada; eventos representativos de todos os escritores, especialmente fechamento e integração; falhas em gravações transacionais versus pós-commit; schema/migration PG, índices, FKs e binding.

## Lacunas e cobertura

- **Procedures descobertas:** 50 estáticas classificadas nos 10 routers/domain conforme inventário.
- **Procedures sem cobertura declaradas:** nenhuma. O inventário fornecido apresenta `uncoveredProcedures: []`.
- **Domínios reportados como falhos:** nenhum; `Falhas: []`.
- **Cobertura de testes:** não deve ser confundida com cobertura do inventário. Os resultados registram ausência/não localização de testes específicos, entre outros, para login/bootstrap/me, analytics e procedures do router de inventário. A auditoria não executou testes.
- **Limitação central:** nenhuma conclusão sobre migração aplicada, conteúdo/qualidade dos dados, runtime/deployment efetivo, collation instalada, configuração dos serviços/bindings ou prontidão operacional pode ser confirmada somente com os resultados estáticos.

## Bloqueadores identificados no snapshot inicial (ver atualização de status ao final)

1. Ligar explicitamente o handler tRPC/routers ao runtime Worker e ao provider PostgreSQL com Hyperdrive; o caminho descrito ainda retorna `503 MIGRATION_INCOMPLETE` e continua importando o banco/schema MySQL.
2. Implementar injeção de DB por contexto/request sem fallback acidental a `process.env.DATABASE_URL`/`mysql2`, e converter todos os módulos e dependências adjacentes para `schema.pg.ts` de forma coerente.
3. Portar e testar operações específicas MySQL: `insertId`, upserts, enums/constraints, tratamento de erro, triggers `updatedAt`, transações e locks; comprovar retorno de IDs e precisão/representação de numeric.
4. Confirmar compatibilidade real do Worker com autenticação/crypto/scrypt/Buffer/cookies e definir a configuração segura de bindings/secrets, incluindo `INITIAL_ADMIN_SETUP_KEY` e configuração de notificações. A limitação local em `Map` não equivale a rate limit compartilhado.
5. Resolver concorrência e integridade que não estão garantidas pelo código/schema descrito, especialmente bootstrap singleton; decidir formalmente se alterações e auditoria hoje separadas permanecerão assim ou mudarão para transações.
6. Validar e planejar migração de dados, constraints, índices, collation, IDs/FKs e migrations PG a partir do estado real do destino em processo autorizado e ambiente isolado. Nada disso foi validado nesta auditoria.
7. Executar a suíte de regressão por domínio e testes de integração do Worker/PostgreSQL antes de corte, comparando respostas e efeitos em fixtures; os testes sugeridos neste relatório ainda são necessários, não resultados executados.
8. Definir compatibilidade do armazenamento de comprovantes: o código descrito usa serviço Forge em fluxos de inventário/divergências; bindings R2 não demonstram equivalência de presign, validação, escopo e persistência.

---

**Conclusão:** as regras de negócio descritas devem permanecer como contratos de regressão. A existência de schema e helper PostgreSQL, por si só, não comprova a migração. O status atualizado e os bloqueios remanescentes estão registrados abaixo. Nenhum dado ou serviço foi acessado para esta auditoria.

## Atualização do estado local — 22/11/2026

- Resolvido no código local: injeção de `ctx.db` PostgreSQL via Hyperdrive/`PG_DATABASE_URL`; autenticação e sessões PostgreSQL explícitas; routers principal, inventory e discrepancies e `closureIntegrations.ts` importam `schema.pg.ts`; `insertId` e upserts MySQL foram adaptados; nenhum router ativo usa `getDb()`/`server/db.ts`.
- Validação local: `pnpm check`, `pnpm test` (46 testes em 12 arquivos), Prettier dos arquivos TypeScript alterados, Wrangler dry-run e smoke test passaram. O handler tRPC está conectado atrás de feature flag e requisito de DB explícito; o smoke test confirmou a rota ainda indisponível em 503 no default. A cobertura segue unitária e não executa operações de negócio contra Neon.
- Auditoria estática independente dos 10 routers: foram identificados defeitos ou riscos sustentados por linhas do código, incluindo configuração `notifyOwner` ainda ligada a `process.env`/Manus; bootstrap sem singleton atômico; gravações/auditoria em statements separados em employees/users/settings; race de `saveDraft` com finalização; possíveis valores fora dos limites `INTEGER`; datas apenas validadas por regex; arredondamento de volumes positivos para zero; `fuelType` livre incompatível com enum do schema; e `approvedAmountCents` sem teto em determinadas transições. Os demais pontos e testes propostos aparecem nas descrições por domínio acima; a revisão é estática e não confirma comportamento no DB/Worker real.
- Pendências: não há execução real com Hyperdrive/Neon, nem schema aplicado; preservar Neon vazio. Corrigir/testar os achados prioritários sem modificar regras de negócio implicitamente. Testar locks, concorrência, transações, numeric, timestamps e auth no Worker antes de ligar a API. Implementar R2 privado para comprovantes/evidências e decidir substituição independente para notificação/heartbeat. A compatibilidade Node/crypto é documentada para a data Wrangler usada; o custo de scrypt ainda não foi medido.
- Restrições preservadas: sem deploy ou escrita remota, sem uso do MySQL/objetos antigos, sem DNS/produção, sem commit/push e sem custos pagos.


## Atualização após correções locais — 22/11/2026

A revisão local corrigiu o limite mínimo de volume para 0,001 L; aplicou `isValidCalendarDate` aos schemas de datas de fechamento, filtros do histórico/dashboard/relatório e filtros de divergências; e passou a verificar o teto de `approvedAmountCents` também em transições posteriores à aprovação. A procedure `system.notifyOwner` foi intencionalmente desativada e não chama mais o serviço Manus; retorna `PRECONDITION_FAILED` até decisão do usuário sobre um canal alternativo. Estas mudanças passaram em 51 testes/14 arquivos, `pnpm check`, Prettier, build, Wrangler dry-run e smoke local (health 200, tRPC 503 default, SPA 200).

Essas evidências não alteram os riscos remanescentes da auditoria: bootstrap e vínculos concorrentes, corrida entre rascunho e finalização, atomicidade pós-commit da auditoria em alguns fluxos, overflow de tipos inteiros/valores e validação de intervalos invertidos ainda exigem análise e testes. Nada foi verificado contra PostgreSQL/Hyperdrive/Worker conectado. R2/Forge, custo de scrypt e integração de autenticação real continuam pendentes; manter tRPC desligado até a revisão e validação integrada.
