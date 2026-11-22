# J Sampaio Postos

Aplicação operacional para fechamentos por turno, recebimentos, estoque de tanques, divergências, relatórios, auditoria e uso mobile/PWA. A migração deve preservar as regras e os fluxos atuais, sem copiar dados de operação ou arquivos antigos.

## Arquitetura de destino

- Frontend: React 19, TypeScript e Vite.
- Backend/API: Cloudflare Workers e tRPC Fetch.
- Banco: PostgreSQL no Neon, acessado por Drizzle ORM e Cloudflare Hyperdrive.
- Arquivos: bucket privado Cloudflare R2.
- Infraestrutura e código: Cloudflare e GitHub.

## Estado desta cópia

O trabalho está isolado em `/home/ubuntu/jsampaio-cloudflare`. O Worker local serve a SPA e expõe `/api/health`; o adapter tRPC Fetch está conectado, mas só pode ser ativado explicitamente por `TRPC_ENABLED=true` com binding PostgreSQL/Hyperdrive, e permanece deliberadamente em `503 MIGRATION_INCOMPLETE` por padrão. A autenticação, sessões, routers de domínio e integrações de fechamento usam `drizzle/schema.pg.ts` e o banco PostgreSQL injetado pelo contexto. O legado `server/db.ts`/MySQL permanece somente como referência sem consumidores no código ativo. O adaptador Express de desenvolvimento exige `PG_DATABASE_URL` e não faz fallback para `DATABASE_URL`.

Validação local mais recente: `pnpm check`, `pnpm test` (51 testes em 14 arquivos), Prettier dos TypeScript alterados, `pnpm build`, `wrangler deploy --dry-run` e smoke HTTP local passaram. O smoke confirmou `/api/health` 200, `/api/trpc/system.health` 503 com `MIGRATION_INCOMPLETE` e a SPA 200. O dry-run empacota o Worker, mas não valida conexão PostgreSQL nem queries; nenhum teste conectou ao Neon. O build mantém aviso de chunk acima de 500 kB. A compatibilidade Node necessária para `node:crypto` está documentada para a `compatibility_date` configurada, mas custo de scrypt e autenticação real no Worker ainda não foram medidos. Também foram reforçadas validações de datas civis, volume mínimo e limite de valor aprovado.

Uploads e evidências ainda usam Forge e precisam de substituição autenticada por R2. `system.notifyOwner` permanece registrada, mas foi deliberadamente desativada: retorna `PRECONDITION_FAILED` e não envia notificações até o usuário escolher um canal independente. O módulo heartbeat permanece até verificar automações externas; a busca no repositório não substitui auditoria de schedules ou integrações fora da cópia.

O projeto Neon `j-sampaio-postos-staging` foi criado na região `aws-sa-east-1`, em plano Free, e permanece vazio: nenhuma migration, tabela, conta ou dado de aplicação foi aplicada. O usuário autorizou o conector Cloudflare API para Worker/Hyperdrive; ele está ativo e as consultas de leitura confirmaram zero Workers e zero configurações Hyperdrive. `/user/tokens/verify` retornou HTTP 401, mas o usuário informa que o token tem acesso total; nenhuma escrita foi tentada. O usuário confirmou que habilitou R2 manualmente sem upgrade, e a leitura de buckets retornou zero. Nenhum Worker, Hyperdrive ou bucket R2 foi provisionado. Não há deploy, mudança de DNS ou alteração de produção. O repositório remoto não recebeu commit ou push.

Não acessar, modificar, exportar ou importar o MySQL antigo nem os objetos do armazenamento antigo. A migração não inclui importação, cutover ou sincronização de dados e arquivos legados. Usar exclusivamente recursos Free; interromper qualquer passo que exija upgrade, cobrança ou autorização adicional.

## Desenvolvimento e validação local

Requisitos: Node.js 22 ou compatível com Wrangler e a versão de pnpm registrada em `package.json`.

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build:static
pnpm exec wrangler dev --local --ip 127.0.0.1
```

Para validar o empacotamento sem publicar:

```bash
pnpm exec wrangler deploy --dry-run
```

`pnpm db:generate:pg` gera SQL local a partir de `drizzle/schema.pg.ts`; não abre conexão e não executa DDL. Inspecione integralmente a migration e os triggers manuais antes de qualquer aplicação ao projeto Neon novo. Ainda não existe procedimento de aplicação PostgreSQL autorizado/validado para esta etapa.

O módulo `server/db.ts` e o schema MySQL permanecem na cópia como referência histórica sem chamadas dos routers ativos; não fazem parte do caminho PostgreSQL. Não executar comandos de migração MySQL nem apontar esta cópia para o banco antigo. O fluxo Worker local pode ser verificado sem conta Cloudflare ou credenciais.

## Autenticação inicial

O código atual já possui `auth.bootstrap`, protegido por `INITIAL_ADMIN_SETUP_KEY` configurada somente no servidor. Esse fluxo cria a unidade e o primeiro administrador; também inclui valores iniciais de bicos, preços zero e configurações, que devem ser revisados durante a conversão para evitar dados operacionais fictícios. Na arquitetura de destino, a chave deve ser um secret do Worker, nunca enviada ao navegador ou gravada no Git. Não importar contas, sessões ou hashes de senha antigos e não incluir credenciais padrão.

## Funcionalidades e dados

Preservar dashboard, fechamentos, histórico, recebimentos, sobras/faltas, divergências, estoque e tanques, relatórios, exportações, impressão, auditoria, papéis, autenticação, responsividade mobile e PWA. Dados novos só deverão ser gravados no PostgreSQL novo após a conversão e validação das queries. O R2 deve permanecer privado e vazio até a implementação de upload e download autenticados.

O shell/ativos do PWA podem permanecer disponíveis offline onde suportado. Rascunhos locais não equivalem a gravação confirmada: fechamento e sincronização só podem ser confirmados após resposta do servidor.
