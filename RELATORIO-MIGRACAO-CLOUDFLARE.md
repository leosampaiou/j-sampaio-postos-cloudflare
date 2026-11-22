# Diagnóstico e plano técnico — Migração do J Sampaio Postos

**Data:** 22/11/2026  
**Etapa:** 2 — Implementação local isolada, ainda incompleta  
**Estado:** Worker/Static Assets local; contexto, autenticação/sessões, routers e integrações de negócio convertidos para schema PostgreSQL no código local. O adapter Fetch está ligado ao `appRouter`, porém protegido por `TRPC_ENABLED=true` e por um binding PostgreSQL explícito; por padrão, tRPC permanece em 503. `pnpm check` e 51 testes em 14 arquivos passaram; build, dry-run do Wrangler, Prettier e smoke HTTP local também passaram. Nenhuma consulta foi executada contra Neon; R2, Hyperdrive e deploy de staging ainda não foram usados.

**Escopo confirmado:** o PostgreSQL novo e o bucket R2 novo começam vazios. Não será fornecido nem utilizado dump, conexão ou export do MySQL antigo; objetos e documentos antigos não serão exportados nem migrados. O MySQL e o armazenamento anteriores permanecem intocados. Só está autorizada a preparação e validação de staging, usando recursos gratuitos; produção, DNS, commits e pushes permanecem fora do escopo.

A integração do adapter HTTP foi adicionada ao Worker com dupla condição de ativação; o caminho normal continua indisponível e responde 503 enquanto não houver opt-in e binding PostgreSQL. Os routers ativos já usam PostgreSQL/Drizzle no código local; `server/db.ts`/MySQL permanece sem consumidores como referência histórica. Uploads/evidências ainda dependem de Forge/Manus. A validação real depende de Hyperdrive, de uploads/downloads privados em R2 e de um Worker exclusivo de staging.

Todo o código permanece na cópia isolada `/home/ubuntu/jsampaio-cloudflare`. O repositório público anterior, o MySQL e o armazenamento antigos não foram alterados. Um projeto Neon novo de staging foi criado na região São Paulo, mas ainda não recebeu schema ou dados; nenhum Worker, Hyperdrive ou bucket R2 foi criado.

## Arquitetura encontrada

O produto é uma SPA React 19 com TypeScript e Vite; a árvore ainda contém Express 4 e o entrypoint legado `server/_core/index.ts`, mas os scripts padrão da cópia não iniciam esse servidor. O Worker Fetch local serve os assets de `dist/public`, responde health e mantém tRPC em 503 até a integração do handler. Os routers operacionais agora importam o schema PostgreSQL e recebem o banco por `ctx.db`; Wrangler ainda está configurado apenas com Static Assets e nenhum binding remoto de R2 ou Hyperdrive foi criado.

A camada de dados usa Drizzle com `drizzle-orm/mysql2`, `mysql2`, `mysql-core` e `dialect: "mysql"`. O schema reúne unidades, usuários, sessões, funcionários, bicos, fechamentos, leituras, recebimentos, auditoria, tanques, movimentos de estoque e divergências. Valores financeiros são majoritariamente centavos inteiros; volumes usam `DECIMAL(14,3)`, uma base adequada para preservar precisão se o mapeamento PostgreSQL conservar esses tipos e as mesmas unidades.

As diferenças de dialeto MySQL já identificadas nos routers/integradores ativos foram convertidas localmente: criação de IDs usa `RETURNING`, upserts usam `ON CONFLICT` com alvos únicos explícitos, e operações recebem o schema PostgreSQL. Ainda é necessário validar no banco real transações, locks `FOR UPDATE`, atomicidade/concorrência sob Hyperdrive, representação dos campos `numeric`, timestamps e triggers; a checagem de tipos não prova equivalência em runtime. `server/db.ts` e o schema MySQL legado permanecem isolados, sem import nos routers ativos.

O diagnóstico anterior registrou que uma consulta no sistema legado encontrou `closures.revision` ausente. Esse fato é apenas histórico e não exige acesso ao banco antigo. A migração atual não copiará dados nem corrigirá a origem: o schema PostgreSQL novo deve refletir o modelo funcional completo e ser aplicado somente ao projeto Neon de staging, depois de confirmar que está vazio.

## Dependências da Manus e funcionalidades a preservar

**Uploads operacionais confirmados:** os routers registrados de inventário e divergências geram URLs Forge de PUT; as telas de estoque e divergências usam essas URLs para anexar comprovantes/evidências, e as chaves são guardadas nos registros. A dependência deve ser substituída por upload/download autenticados via R2, sem copiar objetos antigos. O cliente cria links `/manus-storage/...`, mas `server/_core/storageProxy.ts` não é importado/registrado no entrypoint Express encontrado; portanto o download de comprovantes não está comprovado como funcional nesta cópia. A tela de divergências grava a evidência, mas não foi localizado link de leitura. O R2 deve cobrir uploads e downloads autorizados antes de remover Forge.

**Notificação ao proprietário:** `systemRouter.notifyOwner` continua registrada, mas seu handler foi deliberadamente desativado: retorna `PRECONDITION_FAILED` e não chama o serviço Manus nem envia mensagem. Essa decisão preserva o pedido do usuário até que um canal independente seja escolhido. O caminho tRPC no Worker permanece protegido e indisponível por padrão.

**Autenticação ativa:** o fluxo funcional a preservar é login/senha próprio, hash scrypt para senhas novas, cookie de sessão, sessões persistidas, CSRF e papéis frentista/gerente/administrador. Não haverá cópia de contas, hashes ou sessões legadas. O código já possui `auth.bootstrap`, que exige `INITIAL_ADMIN_SETUP_KEY` no servidor e cria unidade, administrador, quatro bicos, preços iniciais zero e configurações; esse fluxo precisa ser portado para PostgreSQL/Worker e seus valores padrão devem ser validados para não criar dados operacionais fictícios. A autenticação OAuth da plataforma foi removida da cópia isolada após auditoria confirmar ausência de consumidor no login próprio. O módulo heartbeat/cron foi mantido porque schedules/consumidores externos da conta ainda não foram verificados.

**Limitação de segurança operacional:** o rate limit de login usa um `Map` em memória do processo. Em Workers, instâncias são efêmeras e distribuídas; essa estrutura não fornece limite consistente global. A limitação precisa migrar para uma solução compartilhada, como rate limiting na borda ou um componente persistente adequado, antes da produção. `node:crypto` é suportado no runtime documentado, mas o custo da derivação scrypt atual precisa ser medido. O plano Free documenta 10 ms de CPU por requisição, então o hash de senha pode exceder essa cota; não se deve enfraquecer o hash para caber sem avaliação de segurança e benchmark real. [1] [2]

**Limpeza segura de código de plataforma:** foram removidos da cópia isolada, após busca de call sites, SDK/tipos OAuth, helpers de LLM, geração de imagem, Maps/geocoding, transcrição, Data API, armazenamento Forge sem consumidor e o chat de demonstração; a dependência direta `jose` também foi retirada. Configuração de logo hospedado no CDN Manus, manifesto de template Manus e Dockerfile Node obsoleto foram removidos. A coleta/debug e o script público de configuração Manus já haviam sido retirados do build. O módulo heartbeat/cron foi preservado até verificar automações externas. Isso descreve apenas a árvore local, não a conta Manus.

## Arquitetura de destino recomendada

Manter a SPA React/Vite e suas telas, regras de negócio, PWA e contratos tRPC. Publicar o resultado estático do frontend como Workers Static Assets e usar um único Worker para API e roteamento. Para reduzir dependência de APIs Node e seguir o requisito de não executar um servidor tradicional dentro de Workers, a recomendação é adaptar o tRPC para o adaptador Fetch/Edge, que trabalha com `Request` e `Response` e é documentado para Cloudflare Workers. A camada Express não é categoricamente impossível — há um adaptador oficial —, mas o entrypoint atual com `createServer`, `server.listen`, Vite middleware e estáticos precisa mudar de qualquer forma. O adaptador Fetch é a opção mais direta para o runtime de destino. [3] [4] [12]

Usar PostgreSQL gerenciado (Neon é candidato, condicionado à confirmação de conta, região, cotas e política de backup) com Drizzle `pg-core` e driver `pg` conectado por binding Hyperdrive. A documentação da Cloudflare recomenda `pg` com Hyperdrive e fornece integração Drizzle; o suporte específico ao Neon também está documentado. As versões e configurações precisam ser fixadas conforme a documentação vigente no momento da implementação. [5] [6] [7]

Manter sessões, usuários, senhas, permissões e demais dados duráveis no PostgreSQL. Injetar bindings e secrets por `env` do Worker, sem depender de `process.env` como no runtime Node e sem compilar segredos no frontend. Preservar cookies seguros, revogação de sessão e CSRF; atualizar `createContext` para o formato Fetch e refletir headers/cookies na resposta. Conservar as regras de negócio e migrar o limitador de login para um serviço compartilhado. O primeiro backend deve ser sem estado local persistente.

Usar bucket R2 privado. O Worker valida sessão, associação do objeto ao registro, formato e tamanho e só então permite upload, download ou exclusão. Para arquivos de até 10 MiB, o limite máximo aceito hoje nos endpoints, pode-se transmitir o corpo pelo Worker; alternativamente, emitir URLs R2 pré-assinadas curtas para upload direto. A API de binding R2 não gera URL pré-assinada por si só: isso exige um assinador compatível com S3, mantendo as credenciais como secrets. URLs assinadas são credenciais temporárias portadoras; limitar método, objeto, tipo de conteúdo e expiração, e configurar CORS. Não tornar o bucket público. [9] [10]

## Limites de custo que afetam a decisão

Na documentação consultada em 22/11/2026, o plano Workers Free limita o Worker a 100 mil invocações por dia, 10 ms de CPU por requisição, 128 MB por isolate e 50 subrequests por requisição. Hyperdrive Free inclui 100 mil statements por dia; statements de leitura, escrita e DDL contam. Esses limites são independentes: um fluxo pode consumir limite de Worker e de banco. A carga real de login, relatórios, consultas do dashboard e transações deve ser medida em staging, e a cota gratuita não pode ser tratada como garantia de produção. [1] [8]

R2 Standard inclui mensalmente 10 GB-mês de armazenamento, 1 milhão de operações Classe A e 10 milhões Classe B no free tier; não cobra egress. Uso acima das franquias é tarifado, e os limites de uso precisam ser monitorados. [11]

A página pública da Neon, consultada na mesma data, anuncia no plano Free 100 horas-CU por projeto, até 2 CU de autoscaling, 1 GB de armazenamento por projeto e 20 GB totais na conta, além de 5 GB de transferência pública por projeto. O plano não inclui instant restore nem snapshots agendados e não anuncia SLA de uptime. São limites publicados, sujeitos a mudança e às condições da conta. O Free pode servir para staging ou piloto de baixo volume; a escolha para produção só deve ser confirmada depois de estimar volume, disponibilidade, recuperação, backup externo e custo real. [13]

## Plano de migração por etapas

1. **Manter a cópia isolada.** Continuar apenas em `/home/ubuntu/jsampaio-cloudflare`, sem commit/push e sem alterações no repositório ou aplicação antigos.
2. **Converter o produto.** Migrar o backend para Worker Fetch/tRPC, PostgreSQL e R2 sem retirar funcionalidades. Preservar a semântica das regras, autenticação, papéis, transações e arquivos criados no novo sistema.
3. **Inicializar o banco vazio.** Usar somente o projeto Neon novo e vazio; validar schema e queries e aplicar apenas o DDL da aplicação. Não acessar, conectar, exportar ou importar dados do MySQL antigo. Criar o primeiro administrador por fluxo seguro, sem usuário ou senha padrão.
4. **Inicializar armazenamento vazio.** Usar bucket R2 novo, privado e Standard; substituir uploads/downloads Forge/Manus para arquivos novos. Não inventariar, exportar ou migrar objetos antigos.
5. **Preparar staging Free.** Criar Hyperdrive e Worker de staging dedicados, usando secrets fora do Git. Não modificar DNS, não publicar em produção e não aceitar planos pagos ou custos acima das franquias.
6. **Testar no runtime real.** Executar checks, testes e `wrangler dev`/deploy em staging com dados sintéticos temporários. Cobrir autenticação, permissões, fechamento, estoque, divergências, upload/download, relatórios, PDF/Excel, impressão e PWA. Monitorar limites e interromper se houver cobrança, upgrade ou autorização adicional.
7. **Entregar o setup de staging.** Documentar configurações e resultados. Produção, DNS, cutover, importações, commits e pushes não fazem parte desta etapa e dependem de autorização separada.

## Estado de recursos e bloqueios externos

- Neon: organização no plano Free; região `aws-sa-east-1` (São Paulo) disponível. O projeto novo `j-sampaio-postos-staging` foi criado em 22/11/2026, ID `quiet-shape-50609797`, PostgreSQL 17, compute mínimo/máximo de 0,25 CU, database `jsampaio_postos`, branch `main` e nenhum dado/tabela de aplicação. As cotas configuradas são 1.440.000 segundos de compute ativo por período, 5 GiB de transferência e 1 GiB de tamanho lógico por branch. O timeout `0` usa o padrão Free de 5 minutos; o Neon Free não permite ajustar esse intervalo. A chamada com valor explícito `300` falhou antes da criação, e a busca confirmou que não houve projeto parcial. [16] [17]
- Cloudflare: as leituras de conta, Workers, Hyperdrive e buckets retornaram uma conta visível e zero recursos correspondentes. O usuário confirmou que habilitou R2 manualmente sem upgrade; a listagem atual de leitura retornou sucesso e zero buckets. Nenhum bucket, Worker ou Hyperdrive foi criado, e nenhuma escrita remota foi tentada.
- Não há pré-requisito para exportar o MySQL nem os objetos antigos; ambos ficam fora do escopo e intactos. Não há mudança de DNS, produção ou Git remoto.
- Os conectores Cloudflare Worker Bindings e Neon estão autorizados e habilitados. Credenciais não foram gravadas no repositório.

## Estado da implementação local isolada — 22/11/2026

Todo o trabalho está na cópia separada `/home/ubuntu/jsampaio-cloudflare`; o diretório original `/home/ubuntu/jsampaio`, o repositório público anterior e os objetos/serviços atuais não foram alterados. O `origin` da cópia é o novo repositório público vazio `leosampaiou/j-sampaio-postos-cloudflare`; não houve commit nem push. Não há segredos no código.

Foi adicionado um scaffold Wrangler/Workers Static Assets. `/api/health` identifica somente o scaffold e `/api/trpc` permanece explicitamente em `503 MIGRATION_INCOMPLETE`; demais APIs não existentes retornam `404`. O schema PostgreSQL candidato em `drizzle/schema.pg.ts` contém 19 tabelas de aplicação e 10 enums exportados; a tabela OAuth `users/openId` do template Manus foi excluída por não ter consumidor no runtime novo. A migration inicial foi gerada e inspecionada localmente: contém os 10 `CREATE TYPE`, tabelas, constraints e índices; foram acrescentados manualmente seis triggers PostgreSQL para os campos `updatedAt`. O script de geração não executa DDL remoto. **O contexto, auth/sessões, routers ativos e integrações usam agora o provider/schema PostgreSQL, mas o handler Worker ainda não os invoca. A migration não foi aplicada; o projeto Neon permanece vazio e nenhum DDL, usuário, dado operacional ou objeto foi criado.** O schema MySQL permanece somente como referência sem consumidores no caminho ativo.

O contexto tRPC usa `Request`/`Headers`, injeta `ctx.db` via binding Hyperdrive ou `PG_DATABASE_URL` apenas no adaptador Express local e não lê `DATABASE_URL` legado. Auth e sessões executam consultas no banco recebido pelo contexto; o adaptador Express usa uma URL PostgreSQL fictícia em teste sem abrir conexão. A serialização Fetch preserva cookies de 12 horas com `HttpOnly`, `Secure`, `SameSite=None`, logout expirado e múltiplos `Set-Cookie`. O Worker ainda **não** tem handler tRPC funcional. A compatibilidade do `node:crypto`/scrypt no runtime e o rate limit compartilhado continuam pendentes.

Validação após a conversão local: `pnpm check`, `pnpm test` (11 arquivos, 37 testes), `pnpm build`, `wrangler deploy --dry-run` e checagem Prettier dos arquivos alterados passaram. O smoke test local confirmou health 200, tRPC 503 com `MIGRATION_INCOMPLETE` e SPA 200. A migration estrutural anterior contém 19 tabelas, 10 enums e 6 triggers. Nenhum recurso foi publicado. Não há evidência de login executado em Workers, consultas PostgreSQL, integração Hyperdrive/R2, dados operacionais ou compatibilidade funcional completa.

Não é necessário pedir export, conexão, timezone ou acesso ao MySQL antigo, nem inventário ou exportação de arquivos antigos. O usuário autorizou o conector Cloudflare API para Worker/Hyperdrive e confirmou que habilitou R2 manualmente sem upgrade. A listagem somente de leitura de buckets R2 retornou sucesso e zero buckets, confirmando que o serviço está acessível e vazio. As leituras da conta Cloudflare retornaram uma conta e nenhum Worker ou Hyperdrive. `/user/tokens/verify` respondeu HTTP 401, embora as listagens de conta e recursos tenham retornado 200; o usuário informa que o token tem acesso total, mas nenhuma escrita foi tentada. Não criar nem publicar recursos antes da conversão e dos testes; se uma operação futura indicar permissão insuficiente, custo ou upgrade, interromper. Até tRPC, autenticação, driver e queries estarem convertidos e testados, o Worker continua deliberadamente em `503 MIGRATION_INCOMPLETE`. Também falta verificar se há heartbeat/jobs externos que dependam do módulo legado mantido. O MySQL e armazenamento anteriores permanecem intactos.

## Verificação adicional — `scrypt` no Workers

A documentação atual da Cloudflare declara suporte integral às APIs `node:crypto`, exceto para uma lista de recursos não relacionados a `scrypt`; ela também informa que compatibilidade de Node é habilitada por padrão em `compatibility_date` a partir de 2026-08-04. O changelog confirma que `scrypt()` e `scryptSync()` foram incluídas no runtime em 2024. Como o Wrangler da cópia usa data 2026-11-22, há base documental para manter o formato de hash existente sem trocar o algoritmo; ainda é necessário medir custo/limites reais de CPU e verificar login no Worker de staging antes de produção [14] [15].

## Conector Cloudflare API e permissões de staging

Após a autorização do usuário, o conector Cloudflare API existente foi habilitado. A enumeração de contas retornou uma conta visível, sem necessidade de seleção. As chamadas somente de leitura para listar scripts Workers e configurações Hyperdrive retornaram HTTP 200 e listas vazias; a listagem read-only de buckets R2 também retornou sucesso e zero buckets. Essas leituras não testam escrita. A chamada `/user/tokens/verify` retornou HTTP 401, embora o usuário confirme que o token tem acesso total. Nenhum endpoint de criação, atualização ou publicação foi chamado.

A documentação da Cloudflare indica `Hyperdrive Write` para criar uma configuração Hyperdrive e `Workers Scripts Write` para enviar/atualizar um script [18] [19]. O envio de assets também pode publicar uma versão do Worker; nenhum fluxo de upload/deploy deve ser usado antes da conversão e validação funcional [20]. Tokens devem ter escopo limitado ao necessário e nunca ser registrados neste repositório [21]. O usuário confirma que R2 foi habilitado manualmente sem upgrade; a API lista zero buckets. Ainda não houve operações de escrita.

## Referências

[1]: https://developers.cloudflare.com/workers/platform/limits/ "Cloudflare Workers Limits"
[2]: https://developers.cloudflare.com/workers/runtime-apis/nodejs/ "Cloudflare Node.js compatibility"
[3]: https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/ "Deploy an Express.js application on Cloudflare Workers"
[4]: https://trpc.io/docs/server/adapters/fetch "tRPC Fetch and Edge Runtimes Adapter"
[5]: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/ "Connect to PostgreSQL with Hyperdrive"
[6]: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/neon/ "Connect Neon to Cloudflare Hyperdrive"
[7]: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/ "Drizzle ORM with Hyperdrive"
[8]: https://developers.cloudflare.com/hyperdrive/platform/pricing/ "Hyperdrive pricing and Free plan limits"
[9]: https://developers.cloudflare.com/r2/api/workers/workers-api-usage/ "Use R2 from Workers"
[10]: https://developers.cloudflare.com/r2/api/s3/presigned-urls/ "Cloudflare R2 presigned URLs"
[11]: https://developers.cloudflare.com/r2/pricing/ "Cloudflare R2 pricing"
[12]: https://developers.cloudflare.com/workers/static-assets/ "Cloudflare Workers Static Assets"
[13]: https://neon.com/pricing "Neon pricing plans"
[14]: https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/ "Cloudflare Workers node:crypto APIs"
[15]: https://developers.cloudflare.com/workers/platform/changelog/ "Cloudflare Workers changelog"
[16]: https://neon.com/docs/guides/scale-to-zero-guide "Neon scale-to-zero guide"
[17]: https://neon.com/docs/reference/api/projects/update-project "Neon Update Project API"
[18]: https://developers.cloudflare.com/api/resources/hyperdrive/subresources/configs/methods/create/ "Create Hyperdrive configuration"
[19]: https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/ "Update a Cloudflare Worker script"
[20]: https://developers.cloudflare.com/workers/static-assets/direct-upload/ "Direct upload of Workers Static Assets"
[21]: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/ "Create and manage Cloudflare API tokens"


## Atualização de implementação posterior — 22/11/2026

Esta nota prevalece sobre trechos históricos do diagnóstico que descreviam o wiring PostgreSQL como ainda não iniciado. O provider PostgreSQL está conectado ao contexto e os routers ativos e integrações de fechamento usam o schema PostgreSQL. O adapter Fetch do tRPC está ligado ao Worker, mas só é chamado com `TRPC_ENABLED=true` e binding PostgreSQL/Hyperdrive; o default continua seguro em 503. `pnpm check`, `pnpm test` (46 testes em 12 arquivos), Prettier dos arquivos TypeScript alterados, `pnpm build`, Wrangler dry-run e smoke test local passaram. Foram adicionados testes de hash/verificação scrypt, hash de token e comparação de igualdade. O dry-run incluiu os routers no bundle, sem validar conexão, queries ou autenticação real. `server/db.ts`/MySQL continua sem consumidores ativos e foi mantido como referência, não configurado nem conectado.

O caminho padrão `/api/trpc` permanece em `503 MIGRATION_INCOMPLETE`; com opt-in sem DB retorna `503 POSTGRES_NOT_CONFIGURED`. O smoke test confirmou health 200, tRPC 503 e SPA 200. A documentação Cloudflare indica que Node compatibility é padrão para datas de compatibilidade a partir de 2026-08-04 e declara suporte integral a `node:crypto` com exceções não relacionadas ao scrypt; a cópia usa data 2026-11-22. Isso confirma a disponibilidade documentada das APIs, mas não mede o custo do scrypt nem valida login em Worker [2] [14]. Não foi aberta conexão com Neon, aplicada migration, criado Worker/Hyperdrive/bucket, nem executada escrita remota. O projeto Neon e o bucket R2 permanecem vazios. Os testes atuais não comprovam equivalência real de queries, locks, transações, campos numeric, autenticação no Worker ou cargas de arquivo.

Uma revisão estática independente dos 10 routers encontrou problemas demonstráveis em atomicidade de auditoria, corridas de bootstrap/salvamento/vínculo de funcionário e validações de volume, datas, combustível e valores de ajustes/fechamento. Também identificou que a notificação ao proprietário ainda lê configuração Manus via `process.env`, em vez de consumir bindings Worker. Os riscos e referências `arquivo:linha` foram registrados na auditoria; nenhum foi verificado em PostgreSQL/Worker real. As mudanças de regra devem passar por testes locais e revisão antes de ativar o tRPC.

Próximos bloqueios: testar e corrigir os achados prioritários sem alterar regras de negócio inadvertidamente; validar queries, locks, transações, tipos numeric, datas e concorrência PostgreSQL; confirmar contratos PostgreSQL/Hyperdrive antes de DDL; substituir Forge por upload/download privado R2; escolher substituto independente para notificação e verificar automações externas. Manter o tRPC desativado até haver validação suficiente. Permanecem proibidos acesso a MySQL/objetos antigos, produção/DNS, deploy de produção, commit/push, planos pagos e cobranças.


## Atualização de validação local — 22/11/2026

- Foram aplicadas validações de data civil real aos fechamentos, filtros de listagem/intervalo, dashboard e relatório em `server/routers.ts`, e aos filtros de período em `server/routers/discrepancies.ts`; o módulo de estoque já utilizava o helper `isValidCalendarDate`. Calendários impossíveis, como 31 de fevereiro, são rejeitados. Intervalos invertidos ainda não recebem regra de ordenação adicional.
- O volume mínimo recebido/baixado permanece alinhado ao formulário em 0,001 L. A validação do teto de `approvedAmountCents` também se aplica às transições posteriores ao status “aprovado”. `system.notifyOwner` continua registrado, mas retorna `PRECONDITION_FAILED` sem chamar qualquer serviço até o usuário escolher um canal independente.
- Validação final local: `pnpm test` — 51 testes em 14 arquivos; `pnpm check`; Prettier dos TypeScript alterados; `pnpm build`; `wrangler deploy --dry-run`; smoke HTTP do Wrangler local. O smoke confirmou health 200, tRPC 503 com `MIGRATION_INCOMPLETE` por padrão e SPA 200. O build passa, mas ainda avisa que o maior chunk JavaScript excede 500 kB.
- O dry-run empacotou SPA e Worker, mas não fez deploy. Nenhum teste abriu conexão com Neon, executou query, aplicou DDL, criou dado ou acessou recursos Cloudflare remotamente. Continuam pendentes validações de concorrência/atomicidade, numeric e limites de inteiros, locks/transações no PostgreSQL/Hyperdrive, login e custo de scrypt em Worker e upload/download autenticado via R2. A API permanece desligada por padrão.
- Restrições mantidas: Neon de staging permanece vazio; R2 não tem bucket criado; sem Worker/Hyperdrive criados, deploy, alteração DNS/produção, commit/push, acesso ao MySQL antigo, objetos antigos, upgrade ou cobrança.

## Staging (22/11/2026) — plano Free

- Worker: `j-sampaio-postos-staging` — https://j-sampaio-postos-staging.jsampaio-postos.workers.dev
- Neon: projeto `quiet-shape-50609797` (sa-east-1, PG17), migration `0000_initial_postgres.sql` aplicada (19 tabelas, 6 triggers).
- Hyperdrive `jsampaio-staging-neon` (cache desligado), bucket R2 privado `jsampaio-staging-files`.
- Arquivos: `/api/files/*` no Worker (sessão + papel + CSRF + unidade + assinatura do arquivo). O Forge/Manus foi removido.
- Conexão PostgreSQL por requisição (`server/db.worker.ts`), encerrada com `waitUntil`. Stack traces removidos das respostas tRPC.
- Smoke e2e remoto (`scripts/smoke-staging.mjs`): 29/29 passos (bootstrap, login, configurações, funcionários, tanque, entrada, upload/download R2, fechamento, finalização, painéis, auditoria, logout). Dados de teste apagados depois.
- scrypt (N=16384) funcionou no Free sem erro de limite de CPU; ainda vale acompanhar os logs.
- Pendências: notificação ao dono desativada; rate limit de login em memória (por isolate); testes de integração `*.itest.ts` do PG local ainda não escritos; produção/DNS não autorizados.
