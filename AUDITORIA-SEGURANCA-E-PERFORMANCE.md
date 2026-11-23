# Auditoria de segurança e desempenho — J. Sampaio Postos

**Data:** 23 de novembro de 2026
**Escopo:** Worker, PostgreSQL/Drizzle, API tRPC, R2, frontend/cache, testes e bundle.
**Estado:** auditoria e correções parciais. Não interpretar as correções listadas como conclusão integral da auditoria.

## Resumo executivo

A entrega anterior corrigiu a autorização de download R2 e o limite/assinatura do corpo de upload. Nesta continuação foi adicionado rate limiting compartilhado e persistido no PostgreSQL, com buckets pseudonimizados por IP e por par IP/conta, atraso progressivo e expurgo oportunista limitado. O cadastro concorrente de contas vinculadas a funcionário agora usa transação, bloqueio de linha e atualização condicional; um índice parcial único impede vínculos duplicados. No dashboard de estoque, o saldo passou a ser agregado no PostgreSQL e a última medição usa desempate por maior ID.

As correções de rate limit e vínculo foram exercitadas por testes de integração em PostgreSQL local descartável, inclusive com duas conexões independentes. Nenhum banco Neon de staging/produção foi conectado ou alterado. A migração UUID integral ainda não foi implementada. CSP/cabeçalhos, isolamento multiunidade e atomicidade global da auditoria não foram certificados. Também permanecem otimizações de histórico/paginação e carregamento sob demanda do frontend.

## Achados e estado

| Severidade | Achado | Estado e evidência |
|---|---|---|
| Alta | Download R2 dependia de sessão/perfil/unidade, mas não confirmava o registro proprietário; upload podia ler o corpo inteiro antes de validar seu tamanho real. | **Corrigido na entrega anterior** em `worker/files.ts`; testes cobrem proprietário ausente e corpo real acima de 10 MiB apesar de `Content-Length` inferior. |
| Alta | Rate limit armazenado apenas na memória local do Worker podia ser contornado entre instâncias ou reinícios. | **Corrigido parcialmente e testado**: PostgreSQL persistente, hash SHA-256 das chaves, bucket por IP e por IP/conta, limite de janela e backoff progressivo. Teste de integração confirmou persistência entre clientes Drizzle independentes. Ainda requer monitoramento de volume/cardinalidade em produção e política operacional para eventual indisponibilidade do banco. |
| Alta | Vínculo funcionário–usuário sujeito a corrida e duplicidade. | **Corrigido e testado**: transação com `FOR UPDATE`, atualização condicional e índice parcial único; integração concorrente confirmou apenas uma conta vinculada ao funcionário. A migration aborta com diagnóstico se encontrar vínculos duplicados preexistentes. |
| Alta | IDs `SERIAL`/`INTEGER` atravessam PK/FK, tRPC/Zod, UI e auditoria polimórfica. | **Pendente; nenhuma conversão parcial aplicada.** A conversão integral precisa mapear relações, contratos e identificadores de arquivos/idempotência, testar preservação e coordenar um cutover compatível. UUID não substitui autorização. |
| Média/Alta | Cabeçalhos globais e CSP do Worker precisam considerar HTML transformado pela plataforma, inline/CDNs e Preview cross-site. | **Pendente.** Não foi aplicada política CSP potencialmente incompatível. Não usar `X-Frame-Options: DENY/SAMEORIGIN` nem `frame-ancestors 'none'/'self'`; quebrariam o Preview. |
| Média | `inventory.dashboard` carregava e agregava em JavaScript histórico amplo de movimentos/medições. | **Otimização parcial**: saldo agregado com `SUM`/`MAX` no PostgreSQL e última medição selecionada com ordenação determinística por data e ID. Não há medição de ganho de latência nem `EXPLAIN (ANALYZE, BUFFERS)` representativo. |
| Média | Listas, históricos e backfills de divergências/relatórios precisam de paginação estável, filtros no banco e processamento idempotente em lotes. | **Pendente.** Não reduzir conjuntos silenciosamente nem apagar histórico; planejar/validar consultas com dados representativos antes de declarar melhoria. |
| Média | O frontend dispara consultas de histórico do estoque antes de sua abertura e invalida conjuntos amplos de cache. | **Pendente.** Consultas sob demanda e invalidações seletivas ainda não implementadas. Cache autenticado deve continuar isolado por usuário/unidade. |
| Média | Bundle inicial excede 500 kB; relatórios/downloads podem contribuir para custo de carregamento. | **Aviso confirmado na build.** Sem split adicional nesta continuação; veja os tamanhos abaixo. |
| Média | Multiunidade e atomicidade da trilha de auditoria precisam ser avaliadas em todas as mutações, não apenas nos routers revisados. | **Pendente de auditoria abrangente.** Não afirmar isolamento global ou atomicidade completa sem revisão/testes por mutation. |

## Migração UUID: requisitos e rollback

O schema PostgreSQL usa IDs numéricos em múltiplas entidades. Uma mudança parcial em PKs ou somente no schema deixaria FKs, contratos e UI incompatíveis, portanto não foi feita. A migração exige inventário integral de PK/FK, tRPC, validações, estado do cliente, idempotência, referências R2 e `auditEvents.targetId` (polimórfico).

Antes do cutover: obter backup restaurável, usar banco isolado, medir contagens e órfãos, criar mapeamento antigo→UUID, acrescentar/preencher/validar todas as chaves e relações, testar versão compatível da API e UI e ensaiar reversão. Manter colunas e mapeamentos antigos até confirmar integridade após cutover. Rollback não deve apagar dados nem remover colunas antigas; reverter contratos e reconciliar eventuais escritas UUID via mapeamento. Essa migração e seu ensaio continuam pendentes.

## Validação executada nesta continuação

- `pnpm check`: passou após a correção do SQL do limitador.
- `pnpm test`: 16 arquivos e 71 testes passaram.
- `PG_TEST_URL=<PostgreSQL local descartável> pnpm test:integration`: 1 arquivo, 2 testes passaram; cobre persistência do limitador em conexões independentes e vínculo concorrente. O banco foi criado somente para esta auditoria e removido após os testes.
- `pnpm build`: passou; Vite avisou que o chunk principal excede 500 kB. Não foi medido ganho comparativo de desempenho.
- Não houve acesso a staging/produção, DDL fora do PostgreSQL descartável, mudança de DNS, nem publicação/deploy.

## Pendências prioritárias

1. Implementar paginação sem ocultar histórico, filtros SQL e backfill em lote/idempotente no módulo de divergências e demais listas.
2. Tornar as queries de histórico do estoque sob demanda e revisar invalidações/cache por usuário/unidade.
3. Revisar CSP/cabeçalhos em conjunto com o comportamento de HTML/CDN da plataforma e validar compatibilidade com Preview.
4. Completar testes de isolamento multiunidade e atomicidade da auditoria em mutations.
5. Avaliar code splitting para reduzir o bundle inicial e comparar builds com método idêntico.
6. Planejar e ensaiar migração UUID integral e rollback em banco isolado, sem executar conversão parcial.

**Conclusão:** melhorias específicas foram implementadas e verificadas, mas a auditoria solicitada permanece parcial. Nenhum resultado deve ser interpretado como certificação integral de segurança, desempenho ou conclusão da migração UUID.
