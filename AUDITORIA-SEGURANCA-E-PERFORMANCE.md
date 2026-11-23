# Auditoria de segurança e desempenho — J. Sampaio Postos

**Data:** 22 de novembro de 2026
**Escopo:** revisão técnica do Worker, PostgreSQL/Drizzle, API tRPC, arquivos R2, frontend/cache, testes e bundle.
**Estado:** auditoria parcial; correção de autorização e leitura de upload R2 implementada. Os itens pendentes abaixo não devem ser interpretados como corrigidos.

## Resumo executivo

Foi corrigido um controle de acesso ausente no download de arquivos do R2: além de autenticação, papel e unidade, o servidor agora confirma que o movimento de recebimento ou caso de divergência proprietário existe naquela unidade antes de entregar o objeto. O upload não lê mais o arquivo inteiro com `arrayBuffer()` antes de aplicar o limite; o limite real e a assinatura são verificados no fluxo encaminhado ao R2. Foram adicionados testes para proprietário inexistente e corpo acima de 10 MiB com `Content-Length` falsamente baixo.

Não foi aplicada migration nem executado DDL em banco externo. `PG_TEST_URL` não está configurada. Assim, não foi possível testar concorrência/índices PostgreSQL, medir queries com `EXPLAIN (ANALYZE, BUFFERS)` ou demonstrar preservação/rollback de dados. Rate limiting, condição de corrida de vínculo, cabeçalhos globais/CSP, otimizações de estoque e a migração integral para UUID permanecem pendentes.

## Achados, severidade e estado

| Severidade | Achado | Estado e evidência |
|---|---|---|
| Alta | GET R2 verificava sessão, perfil e unidade da chave, mas não a existência do registro proprietário. Conhecendo uma chave válida de uma unidade acessível, o arquivo poderia ser solicitado após o registro ter sido removido/inexistente. | **Corrigido** em `worker/files.ts`: `ownerExists` agora é obrigatório também no GET. Teste de negação incluído em `worker/files.test.ts`. |
| Alta | Upload confiava inicialmente no tamanho declarado e fazia leitura integral do corpo antes de verificar o tamanho real. | **Corrigido**: rejeição antecipada por tamanho declarado continua; um `TransformStream` aplica o teto de 10 MiB aos bytes reais e valida a assinatura antes de liberar o fluxo para o R2. Teste usa corpo excedente com tamanho declarado de 1 byte. |
| Alta | Rate limit de login usa memória local ao Worker, podendo ser contornado entre instâncias/restarts. | **Pendente**: revisão anterior confirmou o padrão local. Não foi substituído nesta entrega. O mecanismo escolhido deverá usar PostgreSQL existente com chaves de IP/conta, atraso progressivo, expiração/limpeza e respostas que não enumerem contas; validar concorrência em banco de teste antes de migrar. |
| Alta | Vínculo funcionário–usuário não possui garantia única parcial e está sujeito a corrida entre requisições. | **Pendente**: confirmado na revisão do código. A correção deve combinar bloqueio/transação, atualização condicional, conflito explícito, índice parcial único para vínculo não nulo e teste concorrente; não houve DDL. |
| Alta | IDs numéricos existem em 19 tabelas/relações e atravessam contratos, validações e interfaces; auditoria contém alvo polimórfico. | **Pendente, sem migração parcial**. A conversão precisa mapear e preservar toda relação e contrato em rollout compatível; não é seguro adicionar UUID só às PKs ou tratar UUID como autorização. Nenhuma alteração de banco foi executada. Plano preliminar e rollback abaixo. |
| Média/Alta | Respostas do Worker não recebem política global de cabeçalhos; há ausência de CSP global e demais políticas. | **Pendente**. Antes de ativar CSP, validar Vite/React, recursos externos, cookies e o Preview em iframe. Não usar `X-Frame-Options: DENY/SAMEORIGIN` nem `frame-ancestors 'none'/'self'`; isso quebraria o Preview. HSTS deve ser testado em HTTPS e não configurado como preload sem justificativa. |
| Média | `inventory.dashboard` carrega todos os movimentos e medições da unidade e agrega em JavaScript; existem filtros/reduções repetidos por tanque. | **Achado confirmado; otimização pendente**. Há potencial para agrupar saldo por tanque em SQL e selecionar medição mais recente por tanque, preservando a janela completa necessária para cálculos históricos. Não se afirma ganho numérico sem banco e equivalência testada. |
| Média | Rotas de divergência, relatórios e histórico têm áreas a revisar quanto a limites/paginação e backfill em lotes. | **Pendente**. Não limitar registros silenciosamente nem descartar histórico; definir paginação estável e métricas com plano de consulta no banco de teste. |
| Média | Frontend inicia queries de movimentos/medições mesmo com histórico oculto e invalida várias consultas juntas; bundle inicial é grande. | **Pendente**. Não houve alteração de cache/invalidação nem code splitting nesta entrega. O build de referência e o final tiveram os mesmos tamanhos (ver medições); Vite continua alertando chunk acima de 500 kB. |
| Média | Integridade multiunidade, atomicidade da auditoria e limpeza de sessões expiradas requerem revisão completa por mutation. | **Pendente**. Não declarar atomicidade ou isolamento total sem revisão e testes transacionais de todas as rotas sensíveis. |

## Comparativo e método

A referência foi coletada antes das alterações com `pnpm build`; a versão final foi compilada com o mesmo comando e os mesmos scripts. O bundle não mudou porque as alterações foram limitadas a Worker/testes/documentação. Tamanhos em bytes; gzip usa nível 9 e Brotli o padrão Node:

| Asset | Antes minificado | Antes gzip | Depois minificado | Depois gzip |
|---|---:|---:|---:|---:|
| Maior chunk JS `index-*.js` | 1.411.806 | 419.248 | 1.411.806 | 419.248 |
| `xlsx-*.js` | 429.191 | 142.699 | 429.191 | 142.699 |
| `html2canvas-*.js` | 201.041 | 47.182 | 201.041 | 47.182 |
| CSS | 135.658 | 24.366 | 135.658 | 24.366 |

Os nomes com hash mudam conforme o build, portanto a comparação é por extensão e tamanho. O Vite emitiu nos dois builds o aviso de chunk JavaScript acima de 500 kB. **Não houve otimização nem redução mensurável do bundle nesta entrega.** Sem `PG_TEST_URL`, não há comparação honesta de latência, cardinalidade de linhas, buffers ou plano de execução do banco.

## Migração UUID: restrições e plano seguro

O schema atual usa `SERIAL`/`INTEGER` para IDs e relações. A migração exige inventário integral de PK/FK, endpoints, validações Zod, tipos compartilhados, estado do frontend, idempotência, chaves de objetos e `auditEvents.targetId` (que requer tratamento por tipo de alvo). UUID não substitui autorização por papel/unidade/proprietário.

Antes de qualquer execução: obter um banco de teste isolado, verificar backup restaurável e levantar contagens/órfãos/duplicidades. Produzir migration reversível com tabela de mapeamento antigo→UUID preservada; adicionar e preencher colunas UUID para todas as entidades/FKs, validar cada relação e constraints, testar aplicação compatível e só então realizar cutover coordenado de API e UI. Manter IDs numéricos e mapeamentos até confirmar métricas e integridade após cutover. Não executar etapas parciais em produção.

**Rollback:** interromper o cutover antes da remoção de colunas antigas; enquanto mantidas, reverter a aplicação para contratos numéricos e usar o mapeamento para reconciliar escritas feitas no período de compatibilidade. Se já houver novas escritas UUID, preservar mapeamentos e fazer reconciliação explícita antes de voltar. Não apagar colunas/tabelas antigas nem executar rollback destrutivo sem backup restaurado e confirmação do usuário. Esse plano ainda precisa de schema completo, migration testada e ensaio em clone.

## Testes e validação executados

- `pnpm check`: passou (`tsc --noEmit`).
- `pnpm exec vitest run worker/files.test.ts`: 8 testes passaram.
- `pnpm test`: 15 arquivos e 68 testes passaram.
- `pnpm test:integration`: comando executado; pulou integrações por `PG_TEST_URL` ausente (mensagem emitida pelo próprio script).
- `pnpm build`: passou, com aviso Vite de chunk maior que 500 kB.
- Nenhum banco de produção/staging foi acessado; nenhum DDL, commit, push ou deploy está incluído nesta seção de validação.

## Riscos residuais e próximos passos

Priorizar: (1) rate limiting compartilhado por PostgreSQL, com limpeza e teste; (2) vínculo funcionário–usuário com índice parcial e concorrência; (3) cabeçalhos globais compatíveis com Preview; (4) revisão de isolamento por unidade e atomicidade de auditoria; (5) otimização de estoque por agregações SQL equivalentes, paginação e índices apenas após `EXPLAIN`; (6) carregamento condicional/invalidações e code splitting; (7) migração UUID integral apenas em banco isolado com backup, mapeamento e rollback ensaiado.

A auditoria, portanto, **não está integralmente concluída**. O relatório é transparente sobre a parte efetivamente implementada e as pendências que precisam de continuação antes de considerar todos os critérios de segurança/desempenho atendidos.
