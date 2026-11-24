# Auditoria de segurança e desempenho — J. Sampaio Postos

**Data:** 24 de novembro de 2026
**Escopo:** Worker, PostgreSQL/Drizzle, API tRPC, R2, frontend/cache, testes e bundle.
**Estado:** auditoria e correções parciais. Os testes locais não certificam R2 real, banco implantado ou isolamento global.

## Resumo executivo

As correções anteriores de rate limit, vínculo de funcionário e agregações do dashboard permanecem descritas abaixo. Nesta etapa, downloads R2 passaram a exigir correspondência exata entre chave solicitada e chave vinculada ao registro; uploads usam precondição create-only atômica e validam os oito bytes da assinatura PNG. Falhas do binding são respondidas sem expor detalhes internos. Adicionei headers em todas as respostas do Worker, com CSP apenas em modo Report-Only e sem diretivas que bloqueiem a incorporação do Preview. O vínculo de comprovantes de entrada e evidências de divergência agora rejeita substituição silenciosa e registra valores anterior/posterior na auditoria.

Os testes locais desta etapa cobrem R2 por doubles/mocks, incluindo duas requisições concorrentes e conflito condicional simulado; não houve teste contra bucket R2 real. As novas regras de anexos com bloqueio transacional foram verificadas por TypeScript, mas aguardam teste PostgreSQL isolado. Nenhum banco Neon, binding R2 remoto ou migration foi acessado. A migração UUID integral não foi iniciada. Também permanecem otimizações de histórico/paginação, drafts/logout e carregamento sob demanda do frontend.

## Achados e estado

| Severidade | Achado | Estado e evidência |
|---|---|---|
| Alta | Download R2 dependia de sessão/perfil/unidade, mas não confirmava o registro proprietário; upload podia ler o corpo inteiro antes de validar seu tamanho real. | **Parcialmente corrigido e testado localmente** em `worker/files.ts`: download compara chave exata associada ao registro, e o upload mantém validação de tamanho/assinatura. A garantia da precondição atômica create-only foi simulada em mock, não validada contra R2 real. |
| Alta | Substituição de comprovantes/evidências podia trocar a referência vinculada sem fluxo explícito de revisão. | **Mitigação implementada; teste de integração pendente**: transação bloqueia o registro, referência diferente retorna conflito, referência igual é idempotente e novo vínculo registra chave anterior/posterior em `auditEvents`. |
| Alta | Rate limit armazenado apenas na memória local do Worker podia ser contornado entre instâncias ou reinícios. | **Corrigido parcialmente e testado**: PostgreSQL persistente, hash SHA-256 das chaves, bucket por IP e por IP/conta, limite de janela e backoff progressivo. Teste de integração confirmou persistência entre clientes Drizzle independentes. Ainda requer monitoramento de volume/cardinalidade em produção e política operacional para eventual indisponibilidade do banco. |
| Alta | Vínculo funcionário–usuário sujeito a corrida e duplicidade. | **Corrigido e testado**: transação com `FOR UPDATE`, atualização condicional e índice parcial único; integração concorrente confirmou apenas uma conta vinculada ao funcionário. A migration aborta com diagnóstico se encontrar vínculos duplicados preexistentes. |
| Alta | IDs `SERIAL`/`INTEGER` atravessam PK/FK, tRPC/Zod, UI e auditoria polimórfica. | **Pendente; nenhuma conversão parcial aplicada.** A conversão integral precisa mapear relações, contratos e identificadores de arquivos/idempotência, testar preservação e coordenar um cutover compatível. UUID não substitui autorização. |
| Média/Alta | Cabeçalhos globais e CSP do Worker precisam considerar HTML transformado pela plataforma, inline/CDNs e Preview cross-site. | **Parcialmente corrigido e testado** em `worker/index.ts`: `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS apenas em HTTPS e CSP `Report-Only` em HTML. A política é observacional e ainda deve ser comparada com CSP/CDNs da publicação. Não há `X-Frame-Options` nem `frame-ancestors`, para preservar o Preview. |
| Média | `inventory.dashboard` carregava e agregava em JavaScript histórico amplo de movimentos/medições. | **Otimização parcial**: saldo agregado com `SUM`/`MAX` no PostgreSQL e última medição selecionada com ordenação determinística por data e ID. Não há medição de ganho de latência nem `EXPLAIN (ANALYZE, BUFFERS)` representativo. |
| Média | Listas, históricos e backfills de divergências/relatórios precisam de paginação estável, filtros no banco e processamento idempotente em lotes. | **Pendente.** Não reduzir conjuntos silenciosamente nem apagar histórico; planejar/validar consultas com dados representativos antes de declarar melhoria. |
| Média | O frontend dispara consultas de histórico do estoque antes de sua abertura e invalida conjuntos amplos de cache. | **Pendente.** Consultas sob demanda e invalidações seletivas ainda não implementadas. Cache autenticado deve continuar isolado por usuário/unidade. |
| Média | Bundle inicial excede 500 kB; relatórios/downloads podem contribuir para custo de carregamento. | **Aviso confirmado na build.** Sem split adicional nesta continuação; veja os tamanhos abaixo. |
| Média | Multiunidade e atomicidade da trilha de auditoria precisam ser avaliadas em todas as mutações, não apenas nos routers revisados. | **Pendente de auditoria abrangente.** Não afirmar isolamento global ou atomicidade completa sem revisão/testes por mutation. |
| Média | Datas comerciais e drafts offline podem ser interpretados/limpos de forma inconsistente no fuso do dispositivo ou logout. | **Pendente nesta etapa**: não foram alterados comportamento de drafts/logout nem conversões da interface; manter datas de estoque sob revisão explícita com `America/Sao_Paulo`. |

## Neon staging e conectividade

Não alterei a rede, `allowed_ips` ou `block_public_connections` e não conectei ao Neon. O estado herdado indicava `allowed_ips.ips=[]` e `block_public_connections=false`. A documentação do Neon informa que IP Allow está disponível no plano Scale; a documentação do Cloudflare Hyperdrive descreve conexões de saída usando faixas da Cloudflare. Portanto, não ativei bloqueio de conexões públicas nem restrição por IP, pois isso pode cortar a conectividade atual do Hyperdrive. No Free, a mitigação operacional é manter credenciais fortes e restritas, TLS e segredo somente no binding, e monitorar logs; qualquer mudança de rede exige confirmação específica e plano compatível.

## Migração UUID: requisitos e rollback

O schema PostgreSQL usa IDs numéricos em múltiplas entidades. Uma mudança parcial em PKs ou somente no schema deixaria FKs, contratos e UI incompatíveis, portanto não foi feita. A migração exige inventário integral de PK/FK, tRPC, validações, estado do cliente, idempotência, referências R2 e `auditEvents.targetId` (polimórfico).

Antes do cutover: obter backup restaurável, usar banco isolado, medir contagens e órfãos, criar mapeamento antigo→UUID, acrescentar/preencher/validar todas as chaves e relações, testar versão compatível da API e UI e ensaiar reversão. Manter colunas e mapeamentos antigos até confirmar integridade após cutover. Rollback não deve apagar dados nem remover colunas antigas; reverter contratos e reconciliar eventuais escritas UUID via mapeamento. Essa migração e seu ensaio continuam pendentes.

## Validação executada em 24 de novembro de 2026

- `pnpm check`: passou após as correções desta etapa.
- `pnpm test`: 17 arquivos e 85 testes passaram, incluindo novos casos de headers Worker e upload/download R2 com mock.
- `pnpm test:integration`: **não executou testes**; o script informou que `PG_TEST_URL` não está definida. Neon staging não foi usado como substituto.
- `pnpm build`: passou. Vite avisou que o chunk inicial principal excede 500 kB; não foi medido ganho comparativo de desempenho.
- Sem acesso ao Neon/R2 remoto, migrations, mudanças de rede/DNS, publicação ou deploy nesta etapa.

## Pendências prioritárias

1. Adicionar testes de integração em PostgreSQL isolado para bloqueio concorrente de anexos, audit before/after e isolamento multiunidade; não considerar a mitigação de substituição como integralmente validada até então.
2. Implementar paginação sem ocultar histórico, filtros SQL e backfill em lote/idempotente no módulo de divergências e demais listas.
3. Tornar queries de histórico de estoque sob demanda; revisar invalidações/cache por usuário/unidade, drafts no logout e conversões de data comercial.
4. Comparar CSP Report-Only com HTML/CDNs reais e validar em ambiente Preview antes de qualquer política enforcement.
5. Avaliar code splitting para reduzir o bundle inicial e comparar builds com método idêntico.
6. Planejar e ensaiar migração UUID integral e rollback em PostgreSQL isolado, sem executar conversão parcial.

## Referências técnicas

- Operações condicionais R2: precondições de escrita são atômicas; `onlyIf` evita sobrescrita concorrente. Isso foi usado no código, mas não foi exercitado contra R2 real.
- Neon IP Allow é recurso do plano Scale; não aplicado no staging.
- Hyperdrive usa faixas de saída da Cloudflare; permitir somente endereços residenciais/estáticos não é uma configuração compatível presumida.

[1]: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/ "Cloudflare R2 Workers API reference"
[2]: https://developers.cloudflare.com/r2/api/s3/conditional-operations/ "Cloudflare R2 conditional operations"
[3]: https://neon.com/docs/introduction/ip-allow "Neon IP Allow"
[4]: https://developers.cloudflare.com/hyperdrive/configuration/firewall-and-networking-configuration/ "Cloudflare Hyperdrive firewall and networking"

**Conclusão:** melhorias específicas foram implementadas e verificadas, mas a auditoria solicitada permanece parcial. Nenhum resultado deve ser interpretado como certificação integral de segurança, desempenho ou conclusão da migração UUID.
