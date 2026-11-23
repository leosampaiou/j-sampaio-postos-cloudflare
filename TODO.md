# TODO — J Sampaio Postos | Sistema de Gestão de Fechamentos

Nome atual do aplicativo: J Sampaio Postos. Os critérios de aceite transcritos do escopo fornecido permanecem literais; itens ficam abertos até haver evidência funcional correspondente.

## [ ] Base, identidade visual e estrutura principal

J SAMPAIO POSTOS — SISTEMA DE GESTÃO DE FECHAMENTOS

1. OBJETIVO DO PROJETO

Desenvolva uma aplicação web completa, profissional, moderna e instalável (PWA) para gerenciamento dos fechamentos diários do POSTO J. SAMPAIO.

O sistema deverá substituir a ficha física de Controle Diário de Vendas fornecida como referência, digitalizando todo o processo de fechamento dos turnos e acrescentando ferramentas de gestão, acompanhamento financeiro, relatórios e controle operacional.

A aplicação será utilizada por três categorias de usuários:

- Frentistas.
- Gerentes.
- Administradores.

O objetivo é permitir que a operação de fechamento seja realizada de maneira simples, rápida e segura, enquanto a administração consegue acompanhar o desempenho financeiro e operacional do posto em tempo real.

IMPORTANTE: Não desenvolver apenas um protótipo visual. Construir uma aplicação funcional, com backend, banco de dados persistente, autenticação, controle de permissões e todas as funcionalidades descritas neste documento.

---

2. IDENTIDADE VISUAL E LOGOTIPO

Será enviado junto deste prompt o logotipo oficial do Posto J. Sampaio.

Utilizar obrigatoriamente o arquivo enviado como identidade visual oficial da aplicação.

Requisitos:

- Não redesenhar o logotipo.
- Não modificar suas cores, proporções ou elementos.
- Não substituir por logotipos genéricos.
- Utilizar o logotipo na tela de login, dashboard, menu, relatórios e documentos PDF.
- Criar um ícone de aplicativo derivado do logotipo, preservando sua identidade visual.

Paleta de cores

- Azul-marinho: cor principal.
- Amarelo: cor de destaque.
- Branco: superfícies e fundos.
- Cinza-claro: elementos secundários.
- Verde: resultados conferidos.
- Vermelho: faltas e divergências.
- Laranja: alertas e pendências.

A interface deverá transmitir confiança, organização, precisão e profissionalismo.

Estilo visual

Inspirar-se em softwares modernos de gestão empresarial e sistemas financeiros.

Utilizar:

- Dashboard com cards informativos.
- Gráficos modernos.
- Tabelas organizadas.
- Ícones intuitivos.
- Tipografia legível.
- Bordas discretas.
- Espaçamento adequado.
- Animações sutis.
- Menu lateral em computadores.
- Navegação adaptada para dispositivos móveis.

Evitar aparência de planilha ou formulário antigo.

---

3. ESTRUTURA PRINCIPAL

Criar as seguintes páginas:

1. Dashboard.
2. Novo fechamento.
3. Histórico de fechamentos.
4. Relatórios.
5. Gestão de funcionários.
6. Gestão de usuários.
7. Configurações.
8. Auditoria do sistema.

A navegação deverá respeitar o nível de permissão do usuário conectado.

---

## [ ] Dashboard e acompanhamento dos turnos

4. DASHBOARD PRINCIPAL

O dashboard será a tela inicial do sistema.

Deverá apresentar uma visão geral da operação do posto.

4.1 Indicadores principais

Criar cards com os seguintes indicadores:

- Faturamento do dia.
- Faturamento do mês.
- Litros vendidos no dia.
- Litros vendidos no mês.
- Total recebido no dia.
- Total recebido no mês.
- Quantidade de fechamentos realizados.
- Fechamentos pendentes.
- Fechamentos conferidos.
- Fechamentos com divergência.
- Total de sobras.
- Total de faltas.

Todos os indicadores deverão ser calculados automaticamente com base nos registros reais do banco de dados.

### Complemento de indicadores do dashboard — solicitação de 21/11/2026

- Remover completamente do dashboard principal os cards “Recebido hoje”, “Fechamentos realizados” e “Fechamentos pendentes”; essas informações podem continuar nas respectivas páginas e relatórios.
- Substituir os indicadores separados de sobras e faltas por um único card “Saldo de caixa”, calculado como total de sobras menos total de faltas no período selecionado. Exibir o valor líquido em reais e indicar saldo positivo, negativo ou zerado em verde, vermelho ou cor neutra, respectivamente.
- Não apagar os registros individuais de sobras e faltas; eles continuam disponíveis no módulo de divergências e nos relatórios.
- Preservar os demais indicadores financeiros e operacionais não mencionados nesta solicitação.
- A seção de estoque dos tanques deve permanecer no dashboard principal, imediatamente abaixo dos indicadores financeiros, sem inventar valores.
- O saldo respeita exatamente o período selecionado: “Hoje” limita o cálculo a hoje e “Mês atual” acumula do primeiro dia do mês até a data atual, sem considerar ocorrências fora do intervalo.

4.2 Gráficos

Criar os seguintes gráficos interativos:

Gráfico 1 — Evolução do faturamento

Mostrar a evolução das vendas nos últimos 7 ou 30 dias.

Gráfico 2 — Vendas por combustível

Comparar:

- Gasolina comum.
- Diesel S10.

Mostrar litros vendidos e faturamento.

Gráfico 3 — Formas de recebimento

Mostrar a distribuição financeira entre:

- Dinheiro.
- PIX.
- Débito.
- Crédito.

Utilizar valores monetários e percentuais.

Gráfico 4 — Volume de vendas

Mostrar a quantidade de litros vendidos ao longo do tempo.

Gráfico 5 — Desempenho por turno

Comparar:

- Manhã.
- Tarde.
- Noite.

Mostrar faturamento, litros vendidos e quantidade de fechamentos.

4.3 Situação dos turnos

Criar uma seção chamada "Acompanhamento dos Turnos".

Apresentar os três turnos do dia:

- Manhã.
- Tarde.
- Noite.

Cada turno deverá apresentar seu status:

- Não iniciado.
- Em preenchimento.
- Aguardando conferência.
- Conferido.
- Sobra.
- Falta.

Exemplo visual:

Manhã — Conferido.
Tarde — Pendente.
Noite — Não iniciado.

O dashboard deverá permitir identificar imediatamente quais turnos já foram fechados.

4.4 Filtros

Disponibilizar filtros:

- Hoje.
- Ontem.
- Últimos 7 dias.
- Últimos 30 dias.
- Este mês.
- Mês anterior.
- Período personalizado.

Todos os indicadores e gráficos deverão respeitar os filtros selecionados.

4.5 Acesso rápido

Adicionar botões de acesso rápido:

- Novo fechamento.
- Consultar histórico.
- Relatório diário.
- Gerar PDF consolidado.

---

## [ ] Fechamento: identificação, bicos e cálculo de vendas

5. NOVO FECHAMENTO

Esta é a funcionalidade central do sistema.

O fechamento deverá seguir a estrutura da ficha física fornecida como referência.

Organizar o processo em quatro etapas.

5.1 Identificação do fechamento

Campos:

- Data.
- Turno: Manhã, Tarde ou Noite.
- Frentista responsável.
- Responsável pelo fechamento.

O usuário conectado deverá ser identificado automaticamente.

Permitir que o gerente ou administrador selecione outro funcionário, quando autorizado.

Não permitir dois fechamentos independentes para o mesmo turno e data, salvo mediante reabertura autorizada e registrada em auditoria.

5.2 ETAPA 1 — LEITURA DOS BICOS E LITROS VENDIDOS

Cadastrar inicialmente quatro bicos:

Bico| Combustível
Bico 01| Gasolina Comum
Bico 02| Gasolina Comum
Bico 03| Gasolina Comum
Bico 04| Diesel S10

Para cada bico, disponibilizar:

- Leitura inicial.
- Leitura final.
- Litros vendidos.
- Preço por litro.
- Valor vendido.

Cálculos automáticos

Litros vendidos = Leitura final - Leitura inicial.

Valor vendido = Litros vendidos × Preço por litro.

Os campos de litros e valor vendido deverão ser preenchidos automaticamente.

Impedir leitura final inferior à leitura inicial.

Permitir números decimais nas leituras.

Agrupamentos automáticos

Gasolina Comum

- Somatório dos litros dos bicos 01, 02 e 03.
- Somatório do valor vendido nos três bicos.

Diesel S10

- Litros vendidos no bico 04.
- Valor vendido no bico 04.

Total Geral

- Total de litros vendidos.
- Total financeiro das vendas.

Exibir os resultados em tempo real.

Preços dos combustíveis

Os preços deverão ser configuráveis pelo administrador.

O sistema deverá utilizar o preço vigente no momento do fechamento.

Salvar uma cópia do preço aplicado em cada registro para preservar o histórico.

Quando houver reajuste, os fechamentos anteriores não deverão sofrer alterações.

---

## [ ] Fechamento: recebimentos, conferência, responsabilidades e finalização

5.3 ETAPA 2 — RECEBIMENTOS

Criar quatro campos financeiros:

1. Dinheiro.
2. PIX.
3. Débito.
4. Crédito.

Calcular automaticamente:

Total recebido = Dinheiro + PIX + Débito + Crédito.

Utilizar formatação monetária brasileira:

R$ 0,00.

Permitir valores com casas decimais.

---

5.4 ETAPA 3 — CONFERÊNCIA FINANCEIRA

Criar uma seção de conferência com:

Total das vendas: resultado da etapa 1.

Total recebido: resultado da etapa 2.

Diferença: Total recebido - Total das vendas.

Classificar automaticamente:

- CONFERIDO: diferença igual a zero, considerando a tolerância configurada.
- SOBRA: recebimentos superiores às vendas.
- FALTA: recebimentos inferiores às vendas.

Exemplos:

Vendas: R$ 5.000,00.
Recebimentos: R$ 5.000,00.
Diferença: R$ 0,00.
Resultado: CONFERIDO.

Vendas: R$ 5.000,00.
Recebimentos: R$ 5.020,00.
Diferença: +R$ 20,00.
Resultado: SOBRA.

Vendas: R$ 5.000,00.
Recebimentos: R$ 4.970,00.
Diferença: -R$ 30,00.
Resultado: FALTA.

A tolerância deverá ser configurável pelo administrador, iniciando em R$ 0,00.

Destacar visualmente o resultado.

---

5.5 ETAPA 4 — OBSERVAÇÕES E RESPONSABILIDADES

Criar um campo de texto para:

- Observações.
- Ocorrências do turno.
- Justificativas de diferenças.

Identificação do frentista

- Nome.
- Confirmação eletrônica de responsabilidade.

Identificação do responsável pelo fechamento

- Nome.
- Confirmação eletrônica de responsabilidade.

Registrar automaticamente:

- Data de criação.
- Horário de criação.
- Usuário responsável.
- Horário de finalização.

---

5.6 FINALIZAÇÃO

Antes de salvar definitivamente, apresentar uma tela de revisão contendo todas as informações.

Disponibilizar:

- Salvar rascunho.
- Voltar e editar.
- Finalizar fechamento.
- Gerar PDF.
- Enviar pelo WhatsApp.

Após a finalização, atualizar automaticamente o histórico e o dashboard.

Fechamentos finalizados deverão ser protegidos contra alterações não autorizadas.

---

## [ ] Histórico de fechamentos

6. HISTÓRICO DE FECHAMENTOS

Criar uma página para consultar todos os fechamentos.

Apresentar tabela com:

- Data.
- Turno.
- Frentista.
- Responsável pelo fechamento.
- Total de litros.
- Total de vendas.
- Total recebido.
- Diferença.
- Situação.

Filtros

- Data.
- Turno.
- Frentista.
- Combustível.
- Situação.

Permitir pesquisa por nome e data.

Ao clicar em um registro, abrir uma página detalhada contendo todas as informações do fechamento.

Disponibilizar nesta página:

- Visualizar.
- Gerar PDF.
- Enviar pelo WhatsApp.
- Solicitar reabertura, conforme permissão.
- Disponibilizar no Histórico a ação “Continuar rascunho”: gerentes e administradores podem retomar rascunhos da unidade; o frentista só pode retomar o próprio rascunho.
- Ao retomar um rascunho, permitir salvá-lo novamente como rascunho ou finalizá-lo; o frentista envia para conferência gerencial e gerente/administrador finaliza.
- Não exigir justificativa para retomar rascunho; manter justificativa obrigatória para corrigir fechamento reaberto.
- Consultar histórico de alterações.

---

## [ ] PDF, WhatsApp e consolidado diário

7. GERAÇÃO DE PDF E COMPARTILHAMENTO PELO WHATSAPP

Esta funcionalidade é obrigatória e deverá ser simples de utilizar, principalmente em celulares.

7.1 Gerar PDF individual

Criar um botão destacado:

GERAR PDF

Ao clicar, gerar automaticamente um PDF profissional do fechamento selecionado.

O documento deverá seguir a identidade visual oficial do Posto J. Sampaio.

Conteúdo do PDF

1. Logotipo.
2. Nome da empresa.
3. CNPJ.
4. Endereço.
5. Data.
6. Turno.
7. Nome do frentista.
8. Nome do responsável pelo fechamento.
9. Tabela dos quatro bicos.
10. Leituras iniciais e finais.
11. Litros vendidos.
12. Preço por litro.
13. Valor vendido por bico.
14. Resumo por combustível.
15. Total geral de litros e vendas.
16. Recebimentos por modalidade.
17. Total recebido.
18. Diferença financeira.
19. Resultado do fechamento.
20. Observações e ocorrências.
21. Confirmação dos responsáveis.
22. Data e horário de registro.

Apresentação

- Formato A4.
- Layout profissional.
- Cores institucionais.
- Valores bem destacados.
- Tabelas legíveis.
- Logotipo corretamente dimensionado.
- Rodapé com identificação do posto.

Nome automático do arquivo:

Fechamento_JSAMPAIO_2026-11-21_MANHA.pdf

A data e o turno deverão ser dinâmicos.

7.2 Enviar pelo WhatsApp

Criar um botão verde destacado:

ENVIAR PELO WHATSAPP

O comportamento esperado:

1. Gerar o PDF do fechamento.
2. Preparar uma mensagem automática.
3. Abrir o compartilhamento nativo do dispositivo.
4. Permitir selecionar o WhatsApp.
5. Compartilhar o PDF como anexo, juntamente com a mensagem, quando suportado.

Mensagem automática:

"Olá! Segue o fechamento do Posto J. Sampaio.

Data: [DATA]
Turno: [TURNO]
Frentista: [NOME]

Total de vendas: R$ [VALOR]
Total recebido: R$ [VALOR]
Diferença: R$ [VALOR]
Resultado: [CONFERIDO/SOBRA/FALTA]

Segue em anexo o relatório completo do fechamento."

Compatibilidade

Utilizar a Web Share API com compartilhamento de arquivos, quando suportada.

Em celulares Android compatíveis, permitir selecionar diretamente o WhatsApp na tela de compartilhamento.

Caso o compartilhamento de arquivos não seja suportado:

- Gerar o PDF.
- Baixar o arquivo automaticamente.
- Abrir o WhatsApp com a mensagem preenchida.
- Orientar o usuário a anexar o PDF baixado.

Não simular o envio automático.

Não afirmar que um arquivo foi enviado sem confirmação do usuário.

7.3 Compartilhamento pelo histórico

Os mesmos botões deverão estar disponíveis nos fechamentos antigos.

7.4 PDF consolidado diário

Criar também a opção de gerar um documento com o consolidado dos três turnos.

Incluir:

- Fechamento da manhã.
- Fechamento da tarde.
- Fechamento da noite.
- Total de litros vendidos.
- Vendas de gasolina comum.
- Vendas de Diesel S10.
- Faturamento total.
- Recebimentos por modalidade.
- Total de sobras.
- Total de faltas.
- Resultado individual de cada turno.

Adicionar botões:

- Gerar PDF diário.
- Enviar resumo diário pelo WhatsApp.

Não considerar turnos pendentes como fechamentos realizados.

---

## [ ] Relatórios gerenciais e exportações

8. RELATÓRIOS GERENCIAIS

Criar uma área completa de relatórios.

8.1 Relatório financeiro

Apresentar:

- Faturamento diário.
- Faturamento semanal.
- Faturamento mensal.
- Total em dinheiro.
- Total em PIX.
- Total em débito.
- Total em crédito.
- Total de diferenças financeiras.

8.2 Relatório por combustível

Apresentar:

- Litros de gasolina comum.
- Litros de Diesel S10.
- Faturamento de gasolina comum.
- Faturamento de Diesel S10.
- Participação percentual de cada combustível.
- Evolução das vendas.

8.3 Relatório por turno

Comparar manhã, tarde e noite.

Apresentar:

- Litros vendidos.
- Faturamento.
- Recebimentos.
- Quantidade de fechamentos.
- Diferenças financeiras.

8.4 Relatório por frentista

Apresentar:

- Quantidade de turnos realizados.
- Total de litros vendidos nos turnos vinculados.
- Total financeiro movimentado.
- Fechamentos conferidos.
- Quantidade de sobras.
- Quantidade de faltas.
- Histórico de divergências.

Os relatórios devem apresentar dados objetivos, sem presumir responsabilidade por divergências.

8.5 Relatório de divergências

Apresentar:

- Data.
- Turno.
- Frentista.
- Responsável pelo fechamento.
- Valor da diferença.
- Classificação.
- Justificativa.

Permitir filtrar por período e funcionário.

8.6 Exportação

Todos os relatórios deverão permitir:

- Exportar PDF.
- Exportar Excel.
- Imprimir.

---

## [ ] Gestão de funcionários

9. GESTÃO DE FUNCIONÁRIOS

Criar cadastro de funcionários contendo:

- Nome completo.
- Status: ativo ou inativo.
- Data de cadastro.
- Usuário vinculado, quando houver.

Permitir:

- Cadastrar.
- Editar.
- Desativar.
- Consultar histórico.
- Associar funcionário a um fechamento.

---

## [ ] Usuários, autenticação e níveis de acesso

10. USUÁRIOS E NÍVEIS DE ACESSO

Implementar três níveis hierárquicos de permissão.

A autenticação deverá ser individual, com login e senha.

Cada funcionário deverá possuir sua própria conta.

10.1 FRENTISTA

O frentista terá acesso operacional.

Permissões:

- Fazer login.
- Visualizar seus próprios dados.
- Iniciar preenchimento de fechamento.
- Informar leituras iniciais e finais.
- Informar recebimentos.
- Registrar observações.
- Identificar-se como responsável pelo turno.
- Salvar rascunhos.
- Consultar seus próprios fechamentos.
- Gerar PDF dos fechamentos aos quais tem acesso.
- Compartilhar seus fechamentos pelo WhatsApp.

Restrições:

- Não acessar relatórios gerenciais.
- Não acessar configurações.
- Não cadastrar usuários.
- Não alterar preços.
- Não excluir fechamentos.
- Não visualizar dados restritos de outros funcionários.
- Não alterar fechamentos finalizados sem autorização.

10.2 GERENTE

O gerente terá acesso à gestão operacional.

Permissões:

- Todas as funcionalidades operacionais.
- Visualizar todos os fechamentos.
- Acessar o dashboard completo.
- Consultar faturamento diário e mensal.
- Consultar recebimentos.
- Consultar vendas por combustível.
- Consultar relatórios por funcionário.
- Consultar divergências.
- Acompanhar turnos pendentes.
- Cadastrar e editar frentistas.
- Aprovar justificativas.
- Autorizar correções operacionais.
- Solicitar ou executar reabertura de fechamentos conforme política definida pelo administrador.
- Gerar PDFs individuais e consolidados.
- Compartilhar relatórios pelo WhatsApp.

Restrições:

- Não criar administradores.
- Não alterar permissões de administradores.
- Não excluir permanentemente registros financeiros.
- Não modificar configurações exclusivas do administrador.

10.3 ADMINISTRADOR

O administrador terá controle completo.

Permissões:

- Todas as funcionalidades do gerente.
- Criar usuários.
- Editar usuários.
- Desativar e reativar contas.
- Criar gerentes.
- Criar outros administradores.
- Definir níveis de acesso.
- Redefinir senhas por fluxo seguro.
- Configurar preços.
- Configurar tolerância financeira.
- Cadastrar e editar bicos.
- Configurar turnos.
- Alterar informações empresariais.
- Configurar a aplicação.
- Consultar todos os relatórios.
- Consultar auditoria.
- Gerenciar backups.
- Autorizar reabertura de fechamentos.
- Gerenciar todas as operações.

10.4 Gestão de usuários

Criar uma página chamada "Usuários e Permissões".

Apresentar:

- Nome.
- Nome de usuário.
- Nível de acesso.
- Status.
- Data de criação.
- Último acesso.

Permitir criar, editar, desativar, reativar e redefinir acesso.

Não permitir contas compartilhadas.

Implementar controle de permissões tanto no frontend quanto no backend.

Não basta esconder botões na interface: as operações devem ser bloqueadas também no servidor e no banco de dados.

---

## [ ] Banco de dados, persistência, segurança e offline

11. PERSISTÊNCIA DE DADOS E BANCO DE DADOS

Este requisito é CRÍTICO.

A aplicação deverá possuir banco de dados real, persistente e hospedado em infraestrutura de backend.

Sugestão tecnológica:

- Supabase.
- PostgreSQL.
- Supabase Auth.
- Row Level Security (RLS).

Também poderá ser utilizada outra arquitetura equivalente, desde que ofereça os mesmos recursos.

Não utilizar LocalStorage ou SessionStorage como banco de dados principal.

Os dados deverão permanecer salvos mesmo quando:

- O usuário fechar o navegador.
- O usuário sair da conta.
- O dispositivo for desligado.
- A aplicação for atualizada.
- O usuário acessar de outro celular.
- O usuário acessar de outro computador.

Armazenar permanentemente:

- Usuários.
- Funcionários.
- Fechamentos.
- Leituras dos bicos.
- Preços aplicados.
- Recebimentos.
- Diferenças.
- Observações.
- Relatórios e dados históricos.
- Configurações.
- Auditoria.

Cada fechamento deverá possuir um identificador único.

Segurança

- Autenticação segura.
- Senhas protegidas.
- Controle de permissões.
- Políticas RLS.
- Proteção dos dados.
- Backups.
- Validação no backend.
- Registro de alterações.
- Proteção de credenciais administrativas.

Não expor chaves privadas no frontend.

Funcionamento offline

Implementar suporte a conexão instável.

Permitir salvar rascunhos localmente e sincronizar quando a internet retornar.

Exibir os estados:

- Online.
- Offline.
- Sincronizando.
- Sincronizado.
- Falha de sincronização.

Nunca informar que um fechamento foi concluído sem confirmação de gravação no servidor.

Implementar proteção contra registros duplicados durante sincronizações.

---

## [ ] Auditoria e rastreabilidade

12. AUDITORIA E RASTREABILIDADE

Criar módulo de auditoria.

Registrar:

- Usuário que criou o fechamento.
- Usuário que conferiu.
- Usuário que alterou.
- Informação alterada.
- Valor anterior.
- Valor novo.
- Data e horário.
- Justificativa.

Fechamentos finalizados não poderão ser excluídos silenciosamente.

Qualquer correção deverá gerar um novo registro de auditoria.

---

## [ ] Configurações administrativas

13. CONFIGURAÇÕES

Criar área administrativa para configurar:

- Nome do posto.
- Logotipo.
- CNPJ.
- Endereço.
- Preços dos combustíveis.
- Tolerância de diferença.
- Usuários.
- Permissões.
- Funcionários.
- Bicos.
- Turnos.
- Dados gerais.

Dados empresariais iniciais

Empresa: D ANDRADE SAMPAIO LTDA.

Nome fantasia: POSTO J. SAMPAIO.

CNPJ: 46.691.152/0001-89.

Endereço: Rua Hildenora Gusmão, 231 – Centro.

Cidade: Vargem Grande/MA.

CEP: 65430-000.

---

## [ ] Aplicação instalável PWA

14. APLICAÇÃO WEB INSTALÁVEL — PWA

A aplicação deverá ser uma Progressive Web App.

Requisitos:

- Instalação em Android.
- Instalação em computadores compatíveis.
- Suporte à instalação em iOS, respeitando as limitações do navegador.
- Ícone próprio.
- Tela de abertura personalizada.
- Interface responsiva.
- Navegação semelhante a aplicativo nativo.
- Boa performance.
- Service Worker.
- Manifest.
- Suporte a funcionamento offline para recursos compatíveis.
- Sincronização de dados.

O usuário deverá conseguir instalar o sistema na tela inicial do celular e utilizá-lo como um aplicativo convencional.

---

## [ ] Arquitetura preparada para expansão

15. ARQUITETURA PREPARADA PARA EXPANSÃO

Inicialmente, o sistema será utilizado pelo Posto J. Sampaio.

Entretanto, desenvolver a arquitetura pensando em uma futura expansão para outras unidades.

Preparar a estrutura para permitir:

- Cadastro de novas unidades.
- Usuários vincula


## Evolução mobile, estoque e divergências — solicitação de 21/11/2026

### [ ] Experiência mobile e navegação
- Reorganizar o dashboard para smartphones: cards adaptados, indicadores em duas colunas quando adequado, gráficos responsivos, textos e valores sem cortes, botões com áreas de toque confortáveis, espaçamentos claros e filtros fáceis de usar.
- No celular, oferecer navegação inferior para Início, Fechamentos, Estoque, Relatórios e Mais; no desktop, manter a navegação lateral.
- Revisar os formulários existentes: largura de campo adequada, teclado numérico para valores/leituras, seletores acessíveis, erros legíveis, botões claros, prevenção de envio duplicado e campos importantes não encobertos pelo teclado virtual.
- No fechamento mobile, mostrar cada bico em card individual em vez de tabela larga; organizar o preenchimento em etapas, destacar cálculos automáticos, facilitar a navegação entre campos e manter as informações essenciais visíveis.
- Revisar login, dashboard, fechamentos, histórico, relatórios, usuários, configurações e módulos novos em 320, 360, 375, 390, 412 e 430 px, além de tablets e computadores; corrigir sobreposição, rolagem horizontal indevida, botões cortados e texto ilegível.

### [ ] Cadastro de tanques, entradas, saídas, medições e histórico
- Criar área “Estoque e Tanques” para controle de combustível armazenado, entradas, saídas, quantidade disponível, consumo médio, autonomia e reposição.
- Administrar tanques com nome/identificação, código, combustível, capacidade total, capacidade operacional, estoque mínimo, estoque inicial, data do último abastecimento e status ativo/inativo. Disponibilizar inicialmente Gasolina Comum e Diesel S10, permitir mais de um tanque por combustível e preparar novos combustíveis para inclusão futura.
- Registrar entrada com tanque, combustível, fornecedor, número da nota, data/horário, litros, valor total, preço por litro, responsável, observações e comprovante opcional; atualizar o saldo automaticamente, impedir duplicidade e manter o histórico.
- Ao finalizar um fechamento, gerar saída vinculada ao tanque e aos litros por bico. Se houver mais de um tanque para o mesmo combustível, exigir configuração da origem por bico ou regra de distribuição; não inventar distribuição. Edição, reabertura ou reprocessamento não pode duplicar baixa; cada movimento tem chave única.
- Calcular estoque teórico = estoque inicial + entradas − saídas − baixas autorizadas. Manter toda movimentação. Baixa extraordinária exige quantidade, motivo, data, responsável e autorização conforme papel; não permitir alteração silenciosa.
- Registrar medição física com tanque, data/horário, volume, responsável e observações; comparar estoque teórico, físico, diferença em litros e percentual. Não substituir automaticamente o teórico; divergências ficam registradas para investigação e ajuste autorizado.
- Estimar autonomia usando histórico real de vendas e permitir médias de 7, 15 e 30 dias. Exibir litros disponíveis, média diária, autonomia, data prevista de esgotamento e projeção para os próximos dias. Com menos de três dias completos válidos, permitir estimativa usando os dias completos disponíveis e indicar baixa confiabilidade; sem dias completos válidos ou quando a média é zero, não gerar previsão artificial.
- Alertar estoque abaixo/próximo do mínimo, autonomia menor que 3 ou 2 dias, divergência físico/teórico e tanque sem atualização recente; configurar limites individualmente por tanque e destacar no dashboard.
- Criar Planejamento de Reposição considerando estoque, capacidade operacional, mínimo, consumo médio, prazo de entrega e reserva de segurança; sugerir quantidade limitada pela capacidade disponível, sem fazer pedidos automaticamente.
- Histórico de movimentos informa data, tanque, tipo, entrada/saída, quantidade, responsável, documento e saldo resultante; filtros por período, tanque, combustível e tipo. Relatórios incluem estoque atual, entradas, saídas, consumo, média diária, autonomia, diferenças físico/teórico, abastecimentos e custo de aquisição, com exportação PDF e Excel.

### [ ] Estoque dos tanques no dashboard
- Exibir obrigatoriamente “ESTOQUE DOS TANQUES” logo abaixo dos indicadores financeiros principais, com um card por tanque cadastrado e atalho para seus detalhes.
- Cada card mostra identificação, combustível, litros teóricos disponíveis, capacidade total, percentual de ocupação, barra de capacidade em relação à capacidade operacional, autonomia, média diária, previsão de esgotamento e situação. Priorizar litros, barra, autonomia e capacidade.
- Cards ficam lado a lado no computador e em coluna no celular. Cores de estoque confortável/atenção/crítico usam faixas configuráveis; card crítico recebe destaque visual.
- Atualizar após fechamento finalizado, entrada, medição, movimento ou correção autorizada. Estoque principal usa o teórico; última medição aparece separadamente como informação complementar.
- Não preencher tanques nem quantidades de exemplo: antes de cadastro real, mostrar instrução de configuração, não valores simulados.

### [ ] Controle de divergências, histórico e resumo mensal
- Criar “Controle de Divergências” integrado ao fechamento. Toda sobra/falta finalizada gera ocorrência vinculada ao fechamento, data, turno, frentista, conferente, tipo, valor, justificativa e status, sem depender de cadastro manual. Não apagar ocorrências individuais ao calcular saldo.
- Usar o funcionário já associado ao fechamento. Se houver vários responsáveis, permitir identificá-los e registrar uma regra explícita de atribuição; não imputar automaticamente a divergência inteira a uma única pessoa sem fundamento.
- Histórico individual apresenta fechamentos realizados/conferidos, contagens e valores de sobras/faltas, saldo acumulado e detalhes cronológicos; gráficos mensais mostram frequência e valores. Cada ocorrência permanece individual.
- “Fechamento mensal de divergências” permite selecionar mês/funcionário e mostra quantidades de fechamentos, conferidos, sobras e faltas, total de sobras, total de faltas e saldo líquido = sobras − faltas; lista todas as ocorrências e permite gerar PDF.
- Cada ocorrência pode ser Pendente de análise, Em investigação, Justificada, Encerrada sem desconto, Encaminhada para análise administrativa ou Resolvida. Gerente/administrador registra comentários, justificativas, evidências, resultado e responsável pela decisão. Não presumir culpa por falta financeira.
- Análise de Ajustes de Folha registra funcionário, período, ocorrência, valor original, valor eventualmente aprovado, justificativa, aprovador, data e situação (Não elegível, Aguardando análise, Aguardando autorização, Aprovado, Rejeitado, Encaminhado à folha, Processado). Nunca descontar automaticamente, presumir culpa, compensar sobras e faltas ou encaminhar sem análise individual, documentação, autorização e validação administrativa/jurídica aplicável (incluindo art. 462 da CLT).
- Relatório mensal administrativo inclui funcionário, contagens, totais, saldo, ocorrências pendentes/justificadas e eventuais ajustes aprovados; permite ordenar por quantidade/valor, sem classificar pessoas como culpadas.

### [ ] Permissões, integridade, auditoria e segurança dos módulos
- Preservar os papéis atuais e aplicar autorização no backend, banco e interface: frentista sem acesso ao estoque geral/movimentos/ocorrências de terceiros/ajustes de folha; consulta às próprias ocorrências conforme configuração. Gerente consulta estoque, registra entradas/medições/movimentos autorizados, analisa divergências e consulta relatórios, mas não aprova folha salvo autorização expressa. Administrador configura tanques/alertas, gerencia movimentos e divergências e autoriza análises administrativas.
- Usar o PostgreSQL novo e vazio de staging; aplicar schema versionado sem importar registros antigos nem preencher tanques, usuários ou movimentos fictícios. Fechamentos criados no novo sistema alimentam saídas; entradas atualizam saldo; medições permitem conciliação; o histórico gerado no destino alimenta autonomia; ocorrências alimentam histórico e consolidação mensal; dashboard apresenta tanques.
- Registrar alterações importantes em auditoria. Edições e reaberturas não geram movimentação de estoque ou ocorrência duplicada. Movimentos não são alterados silenciosamente; correções têm rastreabilidade.
- Validar fluxos sem introduzir dados de teste no banco compartilhado de desenvolvimento/publicação; testar por checagem de tipos, testes unitários isolados e inspeção dos caminhos integrados.

### [ ] Validação integrada de aceite
- Verificar responsividade de páginas, formulários, tabelas, gráficos, menus, barra inferior, navegação e geração PDF em celular.
- Verificar cadastro de tanque, estoque inicial, entrada, atualização de saldo, saída de fechamento, medição física, diferença, autonomia, alertas e sugestão de reposição.
- Verificar cards dos tanques no dashboard e atualização após cada movimento, com responsividade e estados sem dados.
- Verificar ocorrência de sobra e falta, vínculo ao funcionário correto, histórico individual, relatório mensal, justificativas e decisões sem desconto automático.
- Confirmar persistência de registros novos, permissões por perfil, auditoria e ausência de duplicidade; não importar dados do sistema legado.


## Correções solicitadas — login, logout, impressão e dados persistidos (21/11/2026)

### [ ] Login claro e responsivo
- O botão de login deve mostrar claramente “Entrar”, permanecer visível em vários tamanhos de tela e funcionar normalmente.
- Durante o carregamento, deve haver indicação visual e o botão nunca pode ficar vazio.
- Preservar a identidade visual, validação existente e o fluxo seguro de criação inicial quando aplicável.

### [ ] Logout, rotas protegidas e navegação Voltar
- Encerrar a sessão no cliente e no backend, revogar a sessão/token válido e limpar tokens e dados privados autenticados do cache.
- Após logout, redirecionar para o login usando substituição segura do histórico; rotas protegidas devem exigir sessão também quando acessadas diretamente.
- O botão Voltar não pode revelar conteúdo protegido depois do logout; nova restauração de página deve revalidar a sessão.
- Exigir confirmação antes de encerrar sessão para evitar logout acidental.
- Verificar o comportamento em celular e computador. Se o logout falhar, não simular sucesso nem remover estado local antes da confirmação do servidor.

### [ ] Impressão completa de fechamentos existentes
- A impressão deve identificar estabelecimento, data, frentista e responsável.
- Incluir os registros persistidos dos quatro bicos: leituras inicial/final, litros vendidos, preço por litro e valor por bico; incluir recebimentos por modalidade, totais, diferença, resultado e observações.
- A folha deve ser A4, legível, paginada e sem cortes, sobreposição ou elementos desnecessários da interface; compatível com desktop e Android.
- Usar os valores gravados sem recalcular ou alterar os registros do fechamento.

### [ ] Exibição confiável dos dados já persistidos
- Diagnosticar conexão e versão de esquema/tabelas, queries, permissões, filtros, autenticação, mapeamento/serialização, atualização assíncrona e estados de loading/ausência/erro.
- Após correção autorizada, registros existentes devem aparecer no histórico/detalhe/dashboard e permanecer disponíveis após refresh e novo login.
- Não criar amostras, duplicar registros, trocar banco, apagar dados ou apresentar falhas como “nenhum registro”/zeros; oferecer retry e informar falhas de forma explícita.
- Verificar paginação/limites para que registros persistidos mais antigos não sejam silenciosamente omitidos.

### [ ] Banco novo vazio, schema e primeiro administrador
- O PostgreSQL Neon de staging deve ser um projeto novo e vazio; não acessar, exportar, importar, corrigir ou apagar o MySQL antigo. O novo sistema não recebe usuários, senhas, sessões, fechamentos, auditoria ou outros dados operacionais legados.
- Aplicar o schema apenas depois de identificar inequivocamente o projeto Neon novo e confirmar que está vazio. Não executar DDL no banco antigo nem em projetos não destinados a esta aplicação.
- Preservar as funcionalidades de autenticação e permissões para usuários criados no novo sistema. Portar e validar o `auth.bootstrap` existente, protegido por `INITIAL_ADMIN_SETUP_KEY` somente no servidor/Worker, sem usuário/senha padrão e sem copiar contas ou hashes antigos.
- Revisar no bootstrap existente os quatro bicos padrão, preços iniciais de R$ 0 e configurações da unidade para garantir que sejam parâmetros explícitos de configuração, não dados operacionais fictícios inseridos sem confirmação.
- O defeito histórico `closures.revision` pertence ao banco antigo e não autoriza qualquer alteração nele; no destino, validar schema e queries para que a tabela nova inclua todos os campos necessários.

### [ ] Aceite integrado solicitado
- Verificar login válido e inválido; logout e revogação; tentativa de voltar; acesso direto a rota protegida sem sessão.
- Verificar impressão de um fechamento existente, completo e A4.
- Verificar persistência e exibição após refresh e novo login.
- Inspecionar responsividade em Android e computador.
- Manter cada fluxo sem evidência real marcado como pendente; não declarar os quatro problemas corrigidos apenas por build/teste unitário.

### Evidências parciais e bloqueios registrados em 21/11/2026
- Login inválido com usuário fictício exibiu “Usuário ou senha incorretos.”; o usuário entrou pelo Preview usando uma conta existente. O botão “Entrar” foi verificado visualmente em desktop e viewport móvel de 390 px.
- O botão Sair foi disparado pelo DOM porque a camada do Preview interceptava o clique visual. O ramo de cancelamento de `window.confirm` manteve a sessão; o ramo afirmativo levou a `/login`, e uma consulta posterior a `auth.me` respondeu HTTP 401 / `UNAUTHORIZED`. O acesso direto a `/historico` sem sessão e Voltar após logout permaneceram no login. Não foram encontrados tokens ou chaves de autenticação em `sessionStorage`/`localStorage`. A exibição nativa da confirmação e a responsividade autenticada em Android físico ainda não foram verificadas.
- Os testes unitários cobrem conteúdo/escape da ficha A4 e passaram; a impressão de um fechamento real não foi validada porque o detalhe persistido falha pela coluna `closures.revision` ausente. Também permanecem pendentes a exibição dos dados após migração autorizada, refresh e novo login.
- `pnpm check`, `pnpm test` (27 testes em 7 arquivos), `pnpm build` e `git diff --check` passaram. Build: avisos de chunk grande e script existente no `index.html`, sem falha.
- As migrações `0002_inventory_discrepancies` e `0003_payroll_review_revisions` continuam pendentes. Nenhuma migração, escrita, exclusão ou inserção foi executada no banco compartilhado; aguardar backup privado verificável e aprovação explícita antes de qualquer DDL.
- As correções permanecem sem aceite integrado e os itens acima continuam abertos. `publishing.auto_publish=false`; o site não foi publicado.


## [x] Acessibilidade tipográfica e escala de texto
- A tipografia deve usar unidades relativas e permitir que o navegador/dispositivo aplique a preferência de tamanho de texto do usuário; não bloquear zoom nem ajuste automático de texto.
- Em telas móveis, aumentar a legibilidade mantendo conteúdo expansível, com quebra de linhas e sem cortes em botões, campos, navegação ou cards.
- A preferência de tamanho deve propagar-se por todas as páginas do app, não apenas pelo dashboard.


## [ ] Revisão geral do código e limpeza segura
- Revisar cliente, servidor, lógica compartilhada, estilos, testes, configuração, dependências e ativos; confirmar referências no repositório inteiro antes de classificar um símbolo/arquivo como código morto.
- Remover módulos, funções, constantes, estilos ou dependências somente quando não tiverem consumidores ou alvos ativos comprováveis. A limpeza local já retirou SDK/helpers OAuth, chat de demonstração, helpers de LLM/imagem/Maps/transcrição/Data API e `jose`; o heartbeat segue preservado até verificar schedules externos. Uploads e notificação ao proprietário permanecem até substituição/decisão funcional.
- Deixar o código mais fácil de ler e manter com formatação consistente e simplificação de duplicações comprovadas, sem reescrever fluxos nem mudar resultados observáveis.
- Preservar autenticação e permissões, fechamento/rascunhos, estoque, divergências, auditoria, relatórios, PWA, dados e contratos atuais; não executar DDL nem escritas no banco.
- Confirmar `pnpm check`, `pnpm test`, `pnpm build` e `git diff --check`. Nesta etapa de migração não criar commit nem fazer push.


## Migração de infraestrutura para Cloudflare — início em 22/11/2026

### [x] Etapa 1 — diagnóstico e plano técnico
- Analisar a estrutura atual do frontend/backend, autenticação, banco, armazenamento, dependências Manus e compatibilidade com Cloudflare Workers.
- Registrar a arquitetura recomendada, riscos, limites públicos, pré-requisitos e plano por etapas em [`RELATORIO-MIGRACAO-CLOUDFLARE.md`](RELATORIO-MIGRACAO-CLOUDFLARE.md).
- A conclusão desta etapa não significa que código, dados, arquivos ou infraestrutura foram migrados; não houve alteração no MySQL, no armazenamento Manus, em DNS, em contas Cloudflare/Neon ou em produção.

### [ ] Preparar ambiente de staging e implantação Cloudflare
- Preparar somente um Worker separado de staging com Static Assets, PostgreSQL Neon novo e vazio, Hyperdrive e bucket R2 privado novo e vazio; preferir `aws-sa-east-1` (São Paulo) para o banco.
- Usar exclusivamente recursos Free Tier. Não aceitar upgrade, plano pago ou cobrança; interromper se uma configuração exigir autorização extra ou risco de custo além da franquia.
- Não alterar DNS, produção, MySQL ou armazenamento antigo; não publicar produção, não fazer commit/push e não interromper a aplicação atual.
- Guardar secrets fora do código e do frontend; manter `.env.example` sem valores reais e documentar a preparação em português.
- Status externo: Neon Free em São Paulo confirmado e vazio. O usuário autorizou o conector Cloudflare API para Worker/Hyperdrive; ele está ativo e as leituras retornaram uma conta, zero Workers e zero configurações Hyperdrive. `/user/tokens/verify` retornou HTTP 401, mas o usuário informa que o token tem acesso total; nenhuma escrita foi tentada. O usuário confirmou R2 habilitado sem upgrade e a leitura de buckets retornou zero, sem bucket criado. Prosseguir com escritas somente após a conversão funcional, verificando custos e interrompendo em caso de permissão insuficiente, upgrade ou cobrança.

### [ ] Adaptar backend para Workers sem reconstruir o produto
- Preservar as telas, identidade, funcionalidades, componentes, regras de negócio, contratos tRPC e experiência mobile existentes; não simplificar nem remover funcionalidades silenciosamente.
- Não executar um servidor Node tradicional dentro de Workers. Usar um handler Fetch compatível, adaptador tRPC Fetch/Edge e integração de assets estáticos. `nodejs_compat` poderá ser usado conforme a dependência exigir, mas não presumir que todo módulo/API Node seja compatível.
- Remover dependências de `server.listen()`, processo persistente, arquivos locais como armazenamento durável e `process.env` global para configuração runtime; usar bindings e secrets do Worker.
- Manter as APIs e permissões existentes. Testar `fs`, processos, cookies, uploads/downloads, geração de relatórios, impressão, PDF, XLSX e quaisquer bibliotecas Node no runtime real.
- Manter rotas API, healthcheck, cache privado de dados autenticados, sessão e navegação PWA sem depender da infraestrutura Manus.

### [ ] Migrar schema, queries e migrações MySQL para PostgreSQL
- Usar Drizzle com `pg-core`, driver `pg` compatível com Workers/Hyperdrive e atualizar `drizzle.config.ts`.
- Converter schemas, migrações, enums, IDs/autoincrement, índices, relações, constraints, timestamps, transações, locks e queries para PostgreSQL; não se limitar a trocar o driver.
- Substituir padrões MySQL como `insertId`, `onDuplicateKeyUpdate`, enums MySQL e `onUpdateNow()` por comportamento PostgreSQL equivalente e testado.
- Preservar precisão de valores monetários em centavos, volumes e medições com suas casas decimais, sequência/IDs e semântica de cada regra do produto.
- Garantir integridade transacional de fechamentos, estoque e divergências sob pooling Hyperdrive; qualquer mudança em lock ou idempotência deve manter o comportamento e ser validada.

### [x] Não migrar dados legados; iniciar PostgreSQL vazio
- Não solicitar, obter ou usar dump, conexão, export ou acesso ao MySQL antigo; não importar dados, usuários, hashes de senha, sessões, fechamentos, auditoria, configurações ou históricos.
- Criar um projeto Neon independente, identificar o banco de destino e confirmar que está vazio antes de aplicar somente o schema da aplicação.
- O schema e as queries devem preservar regras, relações e funcionalidades, mas não o conteúdo antigo. Testes de integração podem usar dados sintéticos somente em ambiente temporário e devem removê-los ao final; não inserir usuários ou registros fictícios persistentes.
- Migrar o fluxo seguro existente de primeiro administrador (`auth.bootstrap` + `INITIAL_ADMIN_SETUP_KEY`) para PostgreSQL/Worker; confirmar que a chave é configurada como secret e nunca enviada ao navegador ou gravada no Git.
- MySQL original permanece intacto e fora do caminho de conexão do novo sistema; não haverá reconciliação, importação, cutover ou rollback de dados antigos.

### [ ] Operar armazenamento novo e vazio em R2
- Substituir uploads/downloads Forge/Manus por operações R2 seguras para os arquivos criados pelo novo sistema; o bucket começa vazio.
- Não inventariar, exportar, copiar, consultar, preservar ou migrar objetos do armazenamento antigo; os arquivos antigos podem ser descartados.
- Validar formato e tamanho, autorizar por sessão/papel e registro associado, controlar URLs e acessos, tratar falhas e manter exclusão controlada apenas quando permitida.
- Manter bucket privado e não armazenar arquivos duráveis no filesystem do Worker. Usar somente R2 Standard dentro das franquias gratuitas; parar se ativação exigir upgrade/consentimento ou custo adicional.

### [ ] Preservar autenticação e segurança para novas contas e eliminar dependências Manus com critério
- Preservar login/logout próprios, geração/validação de hashes para contas novas, sessões, cookies, CSRF, expiração/revogação, rotas protegidas e papéis frentista/gerente/administrador sempre que tecnicamente possível; não importar contas, hashes ou sessões legadas.
- Não substituir a autenticação própria por provedor externo sem necessidade. Portar o bootstrap atual do primeiro administrador, sem credencial padrão; não há migração de senhas antigas.
- Garantir que logout revogue sessão e que botão Voltar não exponha conteúdo protegido; testar acesso interno sem autenticação.
- Trocar rate limit em memória por mecanismo compatível com instâncias distribuídas; medir custo de scrypt no Worker e não enfraquecer o hash por conveniência.
- Substituir serviços proprietários Manus/Forge, APIs, armazenamento, URLs temporárias e variáveis quando usados. Antes de remover cada capacidade, identificar finalidade, consumidor e alternativa. A rota atual de notificação ao proprietário e uploads de comprovantes/evidências precisam de tratamento explícito; verificar schedules/automations externos da conta Manus.
- Investigar e corrigir os problemas já solicitados: botão “Entrar” sem texto, encerramento de sessão, impressão de fechamento e dados persistidos que não aparecem. Não criar dados fictícios para corrigir exibição.

### [ ] Preservar recursos, experiência mobile e funcionalidades existentes
- Preservar módulos de dashboard, fechamentos, histórico, recebimentos, sobras/faltas, estoque/tanques, divergências, relatórios, exportações, auditoria, usuários e permissões.
- Preservar PWA, navegação e responsividade mobile-first em Android; revisar login, dashboard, formulários, tabelas, tanques, histórico, relatórios, modais, menus e impressão em telas pequenas.
- A impressão deve continuar organizada, legível e adequada ao papel A4. PDF, Excel e relatórios devem refletir registros reais.
- Manter disponibilidade de sessões/dados após reinicializações e novas implantações, sem depender da memória local do Worker.

### [ ] Configurar documentação e entrega local
- Documentar projeto, configuração Wrangler/Workers/assets, variáveis e secrets, PostgreSQL/Hyperdrive/R2, `.env.example`, README em português e instruções de staging; não criar scripts de export/import de dados ou objetos antigos.
- Documentar dependências Manus removidas e substituídas, testes e bloqueios externos; preservar a rastreabilidade de que o novo banco e bucket começam vazios.
- O repositório público novo existe, mas nenhum commit/push é autorizado nesta etapa; entregar a cópia local isolada.

### [ ] Validação funcional, de dados, segurança e Workers
- Testar login, logout, permissões, criação/edição/finalização de fechamentos, histórico, recebimentos, cálculo de sobras/faltas, estoque/tanques, uploads/downloads, impressão, PDF e exportação de relatórios.
- Testar conexão PostgreSQL, leitura/escrita, relações, transações, locks/idempotência e persistência depois de novo deploy.
- Testar build, execução real em Workers, comunicação com PostgreSQL/Hyperdrive e R2, autenticação, falhas, limites do plano e custos de uso gratuito.
- Fazer regressão das funcionalidades antes/depois; testar em staging e em celulares Android. Build bem-sucedido sozinho não comprova funcionamento.
- Marcar como concluída cada capacidade somente com evidência funcional correspondente; manter pendente qualquer etapa que dependa de serviços, dados, arquivos ou contas ainda não acessíveis.

### Bloqueios para iniciar a etapa 2

- [x] Confirmar que não haverá acesso, exportação ou alteração do MySQL antigo nem migração de dados.
- [x] Confirmar que não haverá exportação ou migração de objetos do armazenamento antigo; R2 novo começa vazio.
- [x] Autorizar staging exclusivamente Free, com preferência por Neon São Paulo; a organização Neon Free e `aws-sa-east-1` foram confirmadas.
- [x] Habilitar R2 no Dashboard Cloudflare sem upgrade; o usuário confirmou a habilitação manual e a leitura read-only lista zero buckets. Nenhum bucket foi criado.
- [ ] Usar o conector Cloudflare API autorizado para criar Worker/Hyperdrive somente após a conversão funcional. As leituras funcionam e o usuário informa acesso total; `/user/tokens/verify` respondeu 401 e nenhuma escrita foi tentada. Interromper se permissão, custo ou upgrade forem inesperados.
- [x] Confirmar que DNS, produção, commits e pushes permanecem proibidos nesta etapa.
- [ ] Confirmar que a ativação do R2 e o caminho para Worker/Hyperdrive não causam upgrade ou cobrança; parar se houver custo ou consentimento extra.


## Migração Cloudflare — etapa local de infraestrutura

### [ ] Fundação Workers e entrega da SPA

Situação: configuração Wrangler e handler de scaffold adicionados localmente. O Worker serve assets e expõe health do próprio scaffold; tRPC responde `503` até a API ser migrada. Validações mais recentes: `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test` (36 testes em 11 arquivos), `drizzle-kit check`, migration estruturalmente validada com 19 tabelas/10 enums/seis triggers, `pnpm build`, `wrangler deploy --dry-run` e smoke test local passaram. O smoke test confirmou `GET /api/health` = 200, `/api/trpc/auth.me` = 503 e SPA = 200. O build ainda avisa sobre um chunk acima de 500 kB; o script de config pública e os identificadores/chave Manus examinados não aparecem no bundle. O schema PostgreSQL candidato continua local e não aplicado. A tabela OAuth `users/openId` foi excluída do schema PostgreSQL; SDK/helpers OAuth, helpers sem call site e chat de demonstração foram removidos. O heartbeat segue preservado até verificar jobs externos; uploads Forge e notificação ao proprietário também permanecem. O factory `server/db.pg.ts` ainda não está ligado às rotas e `schema.ts`/driver MySQL continuam ativos como referência. O projeto Neon `j-sampaio-postos-staging` foi criado vazio em `aws-sa-east-1`, compute de 0,25 CU e limites Free configurados. Nenhum DDL, usuário ou dado de aplicação foi criado.

- O projeto deve manter a SPA React 19/TypeScript/Vite existente; o Worker usa handler Fetch, sem `server.listen()` ou adapter Express no runtime Cloudflare.
- A configuração Wrangler deve servir o build existente `dist/public` como Static Assets e manter fallback SPA para rotas de interface.
- Requisições `/api/*` devem passar pelo Worker antes dos assets. `GET /api/health` pode indicar somente disponibilidade do handler.
- Até a API tRPC e suas dependências serem migradas, `/api/trpc` deve responder explicitamente `503` com estado de migração incompleta, sem aparentar funcionamento nem enviar tráfego para a aplicação de origem.
- Nenhum binding Hyperdrive/R2, segredo, recurso Cloudflare, deploy ou DNS será criado ou alterado nesta etapa local. O projeto Neon de staging já existe, mas segue sem schema ou dados.

### [ ] API tRPC, banco PostgreSQL/Hyperdrive e autenticação

- Migrar o adaptador HTTP para tRPC Fetch/Edge e transportar request/response, cookies, CSRF, sessão, papéis e cabeçalhos privados sem remover procedimentos ou contratos usados pelo cliente.
- Converter Drizzle de `mysql-core`/`mysql2` para PostgreSQL usando `pg-core` e Hyperdrive; adaptar IDs com `RETURNING`, upserts, timestamps/enums, transações e concorrência antes de declarar compatibilidade. Preservar autoatualização de `updatedAt` com triggers e usar `timestamptz` para instantes absolutos; representar datas operacionais segundo a regra explícita de fuso do novo sistema, sem conversão de valores legados.
- Preservar login, papéis, sessões e segurança para os novos usuários; não copiar usuários/IDs/hashes do sistema antigo. Portar o bootstrap existente e medir scrypt no Worker; substituir rate limit em memória por solução compartilhada.
- Aplicar DDL exclusivamente ao novo projeto Neon de staging após confirmar que está vazio; não conectar o Worker ao MySQL antigo nem executar DDL nele.

### [ ] R2, integrações e validação de equivalência

- Substituir uploads Forge/Manus por operações no R2 novo e vazio somente quando upload/download autenticados, validação de tipo/tamanho, acesso privado e referências aos objetos criados no destino estiverem cobertos.
- Preservar a notificação registrada ao proprietário ou aprovar alternativa antes de remover a integração atual; inventariar também automações externas.
- Não acessar, exportar, comparar nem migrar objetos antigos; não alterar os objetos nem o MySQL originais.
- Fazer deploy somente no Worker exclusivo de staging quando as permissões e recursos Free estiverem prontos. Não alterar DNS, executar cutover, publicar produção, fazer commit ou push.

### [ ] Revisão final e publicação no repositório novo

- Revisar o diff integral e os arquivos por segredos, dados pessoais, dumps, logs e metadados internos; preservar o repositório público anterior sem alterações.
- Rodar verificações existentes e específicas do Worker/PostgreSQL/R2; registrar falhas e limitações sem marcar critérios como concluídos sem evidência.
- Não realizar commit ou push nesta etapa, mesmo que o repositório remoto esteja configurado; entrega é local, com staging Cloudflare separado da produção.


## Atualização da migração local — 22/11/2026

### [x] Converter routers ativos para provider PostgreSQL local
- `server/_core/context.ts` injeta `PostgresDatabase` por binding Hyperdrive ou `PG_DATABASE_URL` somente no adaptador Express local; não faz fallback para `DATABASE_URL` legado.
- `server/_core/appAuth.ts`, `server/routers.ts`, `server/routers/inventory.ts`, `server/routers/discrepancies.ts` e `server/closureIntegrations.ts` agora usam operações e `drizzle/schema.pg.ts` PostgreSQL.
- IDs gerados usam `RETURNING`; upserts identificam conflitos por chaves únicas explícitas `ON CONFLICT`. `server/db.ts`/MySQL não tem consumidores nos routers ativos e permanece apenas como referência.
- O Worker agora usa o adapter tRPC Fetch ligado ao `appRouter`, mas exige `TRPC_ENABLED=true` e binding PostgreSQL/Hyperdrive. O caminho padrão continua retornando `503 MIGRATION_INCOMPLETE`; opt-in sem banco retorna `503 POSTGRES_NOT_CONFIGURED`.
- Evidência: `pnpm check`, `pnpm test` (46 testes em 12 arquivos), `pnpm build`, `wrangler deploy --dry-run`, Prettier dos arquivos TypeScript alterados e smoke test local passaram. O smoke test confirmou health 200, tRPC 503 e SPA 200. Incluídos testes para a guarda da flag e ausência do DB, regressão que impede fallback a `DATABASE_URL` legado e primitivas de autenticação scrypt/token.

### [ ] Bloqueios mantidos
- O handler Fetch está ligado, mas não foi exercitado com conexão DB e mantém o 503 no default. Não ativar tRPC nem liberar tráfego até validar integração Worker/PostgreSQL, autenticação e fluxos com dados sintéticos autorizados no staging.
- A suíte não executa queries de negócio contra Neon. Não aplicar migration ou inserir dados; o Neon de staging continua vazio.
- Revisão estática dos 10 routers encontrou pontos a corrigir/testar antes de ativar: atomicidade de auditoria, concorrência de bootstrap/salvamento/vínculo, validações de litros/datas/combustível e limites de valores, além de configuração Worker da notificação ao proprietário. Detalhes em `ROUTER-PG-MIGRATION-AUDIT.md`; nenhum foi confirmado contra DB/Worker real.
- Ainda validar locks/transações/idempotência no PostgreSQL/Hyperdrive, representação de `numeric`, timestamps/triggers, login no Worker e custo de scrypt. A documentação Cloudflare confirma Node compatibility e `node:crypto` para a compatibility date utilizada; isso não substitui benchmark nem teste de autenticação real.
- Uploads/evidências ainda usam Forge; implementar acesso autenticado e privado em R2, que está habilitado e sem buckets. Resolver notificação ao proprietário e checar heartbeat/schedules externos antes de remover capacidades.
- Antes de qualquer criação/uso remoto, manter a flag desligada; só considerar testes de integração depois de revisar queries e preservar as condições de Free/staging.

Nenhum deploy, escrita remota, DDL, acesso ao MySQL antigo ou aos objetos antigos, mudança de DNS/produção, commit/push ou contratação/upgrade foi realizado.


## Atualização de validação local — 22/11/2026

- Evidência local mais recente: `pnpm test` passou (51 testes em 14 arquivos), `pnpm check`, Prettier dos TypeScript alterados, `pnpm build`, Wrangler dry-run e smoke HTTP local. O smoke confirmou `/api/health` 200, `/api/trpc/system.health` 503 com `MIGRATION_INCOMPLETE` e SPA 200.
- Foram adicionadas validações de data civil real nos schemas de fechamento e filtros de período de fechamentos, dashboard, relatório e divergências; volume mínimo de entrada/baixa é 0,001 L; valor aprovado continua limitado nas transições posteriores; `system.notifyOwner` está desativada até escolha de canal pelo usuário.
- A suíte e o bundle não validam PostgreSQL/Hyperdrive nem autenticação real no Worker. Permanecem abertos: concorrência/atomicidade, intervalos invertidos e limites numéricos, locks/transações/numeric no PostgreSQL, custo de scrypt, substituição Forge por R2 privado e verificação de automações externas.
- Esta atualização não conclui o aceite integrado nem autoriza ativar tRPC ou conectar recursos remotos. Neon segue vazio; sem DDL, dados sintéticos remotos, bucket, Worker, Hyperdrive, deploy, DNS/produção, commit/push, acesso a dados/objetos antigos ou custos pagos.


## Melhorias de autonomia, dashboard e combustível — solicitação atual

### [x] Autonomia dos tanques
- Calcular autonomia usando o estoque teórico atual e somente vendas finalizadas do combustível correspondente aos bicos vinculados ao tanque no instante real de finalização de cada fechamento.
- Reconstruir o histórico de vínculo bico–tanque a partir dos registros estruturados e do formato legado de auditoria; mudar um vínculo não pode reclassificar vendas históricas para o tanque novo.
- Considerar uma amostra diária apenas quando houver exatamente um fechamento finalizado de cada turno (manhã, tarde e noite) e todos os bicos do tanque naquela data tiverem dados válidos; não tratar turnos ausentes como vendas zero.
- Atualizar resumo e autonomia após cada fechamento finalizado; sem dados suficientes, com menos de três dias completos, sem bicos ativos vinculados ou com média zero, não inventar previsão e comunicar a confiabilidade/ausência de dados, quantidade de dias completos aceitos e data inicial efetiva da amostra.
- Preservar as médias de 7, 15 e 30 dias, o início de estoque do tanque, alertas, capacidade, reposição e demais dados operacionais.

### [x] Dashboard e período padrão
- Ao entrar novamente no dashboard, iniciar no mês corrente, do primeiro ao último dia-calendário daquele mês; manter as outras opções e o período manual selecionado até nova navegação/entrada no dashboard.
- Remover somente os cards “Recebido no período”, “Fechamentos conferidos” e “Fechamentos com divergência” do dashboard; preservar consultas, registros e recursos dessas áreas em outros módulos.
- Manter “Saldo de caixa”, calculado como sobras menos faltas no período selecionado, os demais indicadores não mencionados, os filtros e os tanques logo abaixo dos indicadores financeiros.
- Manter gasolina antes de diesel nos cartões de tanques; usar várias colunas no desktop conforme espaço disponível e uma coluna em telas de até 620 px.

### [x] Identificação consistente dos combustíveis
- Exibir sempre nome explícito e legível: “GASOLINA COMUM” em laranja e “DIESEL S10” em vermelho, em telas, formulários, filtros, cadastro/estoque, vínculos bico–tanque, fechamentos, histórico, gráficos/relatórios, exportações e documentos PDF/impressos.
- Distinguir cores do combustível das cores de status de sucesso, alerta e divergência; manter contraste e preservar rótulos de combustíveis desconhecidos sem alterar dados persistidos.
- Não reclassificar nem migrar combustíveis já gravados; validar correspondência entre combustível do bico e tanque sem mudar registros históricos.

### [ ] Experiência mobile e regressão desktop
- Revisar legibilidade e escala de fonte conforme as preferências do dispositivo, formulários, filtros, dashboard, tabelas, tanques, navegação e documentos em Android/telas pequenas, sem prejudicar a experiência desktop.
- Preservar dados, regras de negócio, módulos, recursos e exportações não citados; evitar dependências desnecessárias.
- Validar tipos, suíte de testes e build; corrigir falhas encontradas, buscar e integrar `origin/main` preservando ambos os lados, repetir as verificações afetadas e fazer commit e push normal para `origin main`, sem force-push.
- Não realizar deploy ou publicação.


## Autonomia real e navegação de Estoque e Tanques — 22/11/2026

### [x] Autonomia baseada em todos os fechamentos reais do dia
- Para calcular consumo/autonomia, considerar todos os fechamentos finalizados e suas vendas no dia, qualquer que seja o turno ou a quantidade de fechamentos. Não exigir exatamente dois fechamentos nem fechamento específico às 13h/22h; não alterar os turnos em formulários, relatórios, dashboard ou outras regras gerais.
- Para cada fechamento, usar a atribuição de bicos vigente no tanque na data/hora daquele fechamento e o combustível correspondente. Somar as vendas dos fechamentos válidos do mesmo dia. Dias sem fechamento válido para o tanque não entram na média; não preencher vendas ausentes como zero nem inferir dados.
- Com um ou mais dias válidos, calcular a média e a autonomia; com menos de três dias completos cobertos, permitir a estimativa e marcá-la como de baixa confiabilidade. Sem dias válidos ou quando a média for zero, não produzir previsão artificial.
- O aviso deve explicar a cobertura real observada sem supor quantidade fixa de fechamentos ou turnos obrigatórios. Não modificar dados persistidos, schema, banco ou migrações.

### [x] Área Estoque e Tanques mais clara e responsiva
- Reorganizar a página em quatro áreas navegáveis e nomeadas: “Visão geral”, “Operações”, “Tanques e bicos” e “Histórico”, com Visão geral aberta inicialmente e navegação utilizável por mouse, teclado e celular.
- “Visão geral” deve priorizar indicadores reais, estado de consulta/erro e resumo de estoque/autonomia/alertas por tanque, sem inventar dados; os detalhes administrativos continuam na área “Tanques e bicos”.
- “Operações” agrupa os fluxos já existentes de entrada, medição física e baixa extraordinária; “Tanques e bicos” mantém cadastro/edição e vínculo explícito dos bicos; “Histórico” mantém movimentos e medições com seus filtros e exportações PDF/Excel.
- Preservar permissões por papel, validações, auditoria/idempotência, comprovantes, filtros, exportações, consulta de dados, mensagens de erro/retry, diferença entre estoque teórico e medição física e todos os fluxos existentes; não remover recursos para simplificar visualmente.
- Aumentar a legibilidade da página e a clareza de hierarquia visual, com campos e ações fáceis de alcançar em celular e sem rolagem confusa entre tarefas; manter a paleta da marca e evitar rolagem horizontal indevida.
- Validar com `pnpm check`, `pnpm test`, `pnpm build`, Prettier e revisão do diff. Esta entrega não altera banco/schema, não publica/deploya e não cria commit/push.

Evidências em 23/11/2026: o cálculo considera todos os fechamentos finalizados do dia; dias com apenas um fechamento, dois ou três podem entrar conforme a cobertura válida de bicos/vendas, sem exigir turno fixo. Turnos sem bicos vinculados ao tanque são ignorados para esse tanque; se um fechamento aplicável não contém venda válida de um bico atribuído, o dia é descartado, não tratado como venda zero. Amostras menores que três dias geram estimativa identificada como baixa confiabilidade; sem dias válidos ou com média zero não há previsão. Testes cobrem um fechamento, três turnos no dia, repetição de turno, dias sem cobertura e mudança histórica de tanque. A área apresenta as quatro seções previstas, com operações, permissões, consultas, filtros, comprovantes e exportações preservados no código. Verificações da mudança mais recente registradas no commit; sem alteração de banco/schema, deploy ou publicação.


## Auditoria de segurança e desempenho — solicitação de 22/11/2026

### [ ] IDs UUID e migração preservadora
- Substituir IDs SERIAL por UUID v4 criptograficamente seguro (preferencialmente `gen_random_uuid()`) nas entidades próprias e converter integralmente PKs, FKs, tipos TypeScript, validações Zod, contratos tRPC, consultas, frontend e idempotência; não deixar relações incompatíveis nem tratar UUID como autorização.
- Antes de executar migration, analisar FKs e dados; preservar registros e relacionamentos; não realizar alteração destrutiva; documentar plano, execução e rollback. Documentar exceções técnicas justificadas.

### [ ] Login e proteção contra força bruta
- Substituir o contador em `Map` por rate limiting compartilhado e compatível com recursos Cloudflare/arquitetura já existente, considerando tentativas por IP e conta, janela, atraso progressivo, ataques distribuídos e enumeração; não depender apenas da memória de um Worker nem introduzir Redis/infra paga sem necessidade comprovada; preservar hashes e verificação de senha.

### [ ] Vínculo funcionário–usuário e isolamento por unidade
- Aplicar índice único parcial que permita NULL, bloqueio transacional, atualização condicional, conflito explícito, atomicidade entre criação, vínculo e auditoria, com teste de concorrência.
- Revisar consultas e mutations de fechamentos, funcionários, tanques, bombas, movimentos, medições, divergências, rateios, auditoria, arquivos, relatórios e configurações; autorização no servidor, sem confiar em IDs do frontend. Avaliar constraints compostas e RLS somente se compatíveis e sem vazamento entre requisições.

### [x] Arquivos R2
- Manter o bucket privado; validar autorização, proprietário/registro, unidade, CSRF, conteúdo real, limite efetivo antes de ler o arquivo inteiro, tipo, caminho e prevenção de sobrescrita; interromper uploads excessivos.

### [ ] Cabeçalhos de segurança
- Implementar CSP compatível com o app, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy e proteção anti-clickjacking sem bloquear Preview nem usar políticas permissivas sem justificativa.

### [ ] Atomicidade e integridade
- Persistir atomicamente alterações sensíveis e eventos de auditoria quando pertencem à mesma operação, priorizando usuários, funcionários, fechamentos, estoque, divergências, rateios, revisões de folha, configurações, reaberturas e correções.
- Revisar constraints, FKs, integridade entre unidades, tipos numéricos, índices relevantes e limpeza de sessões expiradas; não remover índices sem comprovar redundância.

### [ ] Queries, paginação e otimizações PostgreSQL
- Reduzir registros transferidos e processamento em JavaScript; otimizar dashboard/saldo de estoque, histórico de preços, divergências, relatórios, paginação e backfill com agregações SQL/lotes quando equivalentes; evitar N+1 e limites arbitrários que ocultem histórico; preservar cálculos e idempotência.
- Avaliar índices de acordo com filtros/ordenação e medir com `EXPLAIN (ANALYZE, BUFFERS)` em banco de teste autorizado.

### [ ] Frontend, testes e medição
- Ajustar cache por natureza dos dados, invalidações seletivas, consultas repetidas e carregamento/bundle sem expor dados autenticados ou misturar usuários/unidades.
- Criar testes de segurança, isolamento, concorrência, integridade, cálculos e desempenho; comparar antes/depois sem inventar números; executar `pnpm check`, `pnpm test`, `pnpm test:integration` quando houver banco configurado e `pnpm build`, informando limitações.

### [x] Relatório técnico
- Criar `AUDITORIA-SEGURANCA-E-PERFORMANCE.md` com achados/severidade, correções, arquitetura, migrations/índices, otimizações, frontend, testes, medições, riscos residuais, recomendações e instruções de execução/rollback.

### [ ] Entrega GitHub
- Após validação, criar commit `security: harden application and optimize database performance` e fazer push à branch de trabalho sem reescrever histórico, sem force-push, sem secrets ou temporários.


## Segurança e desempenho — continuação da auditoria (23/11/2026)

### [x] Rate limit de login compartilhado e persistente
- Substituir estado apenas em memória do Worker por buckets PostgreSQL compartilhados entre instâncias/reinícios; limitar por IP e por par IP/conta, armazenar chaves pseudonimizadas, aplicar atraso progressivo e limpar registros expirados em lotes limitados. Testes de integração confirmam limite persistente em conexões independentes; comportamento no caso de indisponibilidade do banco ainda requer avaliação operacional.

### [x] Unicidade concorrente do vínculo funcionário–usuário
- Garantir no servidor e no PostgreSQL que um funcionário não seja vinculado a mais de uma conta, preservando contas e vínculos preexistentes; rejeitar conflitos sem duplicar contas. Aplicar migration apenas após preflight de duplicidades. Teste concorrente no PostgreSQL descartável confirmou um único vínculo.

### [x] Reduzir agregações desnecessárias no dashboard de estoque
- Calcular saldo por tanque no SQL e escolher determinística e corretamente a última medição por tanque, sem mudar o histórico ou inventar dados. Verificado por tipos/build; ainda falta plano de execução com volume representativo e medição válida de desempenho.

### [ ] Completar a auditoria técnica sem perda de dados
- Revisar isolamento multiunidade e atomicidade de auditoria em todas as mutações; garantir cache segregado por usuário/unidade. Revisar consultas, paginação e backfill em lotes idempotentes, sem truncar ou ocultar histórico. Fazer consultas de histórico do estoque sob demanda e invalidar apenas os dados afetados. Revisar CSP/cabeçalhos sem quebrar HTML/CDN e Preview cross-site; não aplicar `X-Frame-Options: DENY/SAMEORIGIN` ou `frame-ancestors 'none'/'self'`. Investigar code splitting para reduzir bundle >500 kB e medir somente com método reprodutível.

### [ ] Planejar e validar migração integral para UUID
- Converter PKs/FKs, contratos API/Zod/UI, auditoria polimórfica, idempotência e referências relacionadas como um único rollout coordenado; preservar todos os registros/relacionamentos, testar em banco isolado com backup e ensaiar rollback. UUID não substitui autorização. Não implementar conversão parcial nem executar em produção sem validação e autorização aplicável.

### Evidências desta continuação
- `pnpm check` passou; `pnpm test` passou com 71 testes; `pnpm test:integration` passou com 2 testes PostgreSQL em banco local descartável; `pnpm build` passou com aviso de chunk principal maior que 500 kB. O banco descartável foi removido. Staging/produção não foram acessados. A auditoria permanece parcial até concluir itens abertos acima.


## Simplificação transversal da interface — solicitação de 23/11/2026

### [x] Navegação e visão geral mais simples
- Reorganizar visualmente os destinos frequentes e administrativos que já existem, mantendo todas as rotas e as permissões por perfil. No celular, deixar “Novo fechamento” diretamente acessível para todos os perfis que já podem utilizá-lo; outros destinos continuam disponíveis em “Mais”. Não criar página nem remover opção.
- Agrupar visualmente os indicadores existentes do dashboard por contexto “hoje” e “período”, manter a seção de tanques abaixo dos indicadores e destacar o estado/situação sem esconder métricas, atalhos ou avisos. Preservar os cálculos, consultas e filtros atuais.

### [x] Telas operacionais e de consulta mais claras
- Na tela de fechamento, reduzir repetição visual dos resumos, deixar a próxima ação inequívoca e aproximar avisos existentes da etapa pertinente; manter todos os dados, campos, validações, confirmações, estados, botões e cálculos. Não modificar regras de negócio do fechamento, incluindo crédito de cliente, aferição e abastecimento próprio.
- No histórico e em divergências, agrupar filtros existentes, clarificar títulos de estado/resultado/valores, aproximar listas e ações de análise e reorganizar detalhes em blocos legíveis; preservar registros, colunas/valores, filtros, transições, permissões e ações atuais.
- Em Estoque e Tanques, apresentar as operações existentes de forma progressiva e organizada, evitando expor formulários extensos simultaneamente; preservar todos os formulários, avisos, dados, cálculos, permissões, histórico, filtros e exportações PDF/Excel.

### [x] Relatórios e administração mais legíveis
- Em relatórios, identificar claramente o período aplicado e usar rótulos que expliquem as métricas já existentes, sem mudar fórmulas, filtros, exportações ou valores.
- Em funcionários e usuários, eliminar títulos/textos redundantes, tornar explícitos os vínculos já registrados e agrupar visualmente dados de identidade, associação e acesso; preservar campos, validações, papéis, vínculos e status.
- Em configurações, tornar preços e ajustes autoexplicativos e deixar claros os estados existentes de salvamento; em auditoria, organizar detalhes/valores anterior e novo para leitura rápida, sem ocultar eventos nem substituir valores originais ambíguos.

### [ ] Acessibilidade e legibilidade responsivas em toda a interface
- Associar programaticamente rótulos aos controles onde isso estiver ausente; manter indicação de foco, nomes acessíveis, navegação por teclado e áreas táteis confortáveis.
- Melhorar a leitura de textos/cabeçalhos em telas pequenas e tornar perceptível a rolagem horizontal das tabelas onde todas as colunas continuarem necessárias; não cortar ou esconder dados essenciais.
- Preservar a simplicidade do login, reforçando rótulos/ajuda legíveis e o tamanho do alvo do botão de mostrar senha; apresentar erros existentes de maneira acessível sem expor detalhes técnicos adicionais.
- Validar comportamento responsivo e não regressão com checagem TypeScript, testes, build, formatação, diff limpo e inspeção do Preview; não alterar banco/schema/API e não publicar sem pedido.

### Evidências da rodada — 23/11/2026
- A navegação, o dashboard, o fechamento, o histórico, o estoque, as divergências, os relatórios e as telas administrativas receberam ajustes de apresentação/acessibilidade; a inspeção do diff não encontrou mudanças nos cálculos ou nas regras de negócio. Não foram criadas páginas/módulos nem alterados banco, schema ou API.
- `pnpm check` passou; `pnpm test` passou com 71 testes em 16 arquivos; `pnpm build` passou com o aviso existente de chunk acima de 500 kB; Prettier nos fontes alterados e `git diff --check` passaram.
- O Preview foi inspecionado em 1280×900 e 375×812 na tela de acesso. As telas autenticadas foram revisadas por código, mas não visualmente, pois esta rodada não usou credenciais nem dados de teste.
- Nenhum commit, push ou publicação foi feito nesta rodada.
