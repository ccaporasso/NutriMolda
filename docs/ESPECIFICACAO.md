# Especificação — Kit do Consultório, versão 1

## O que é

Uma solução configurável sobre uma base comum (D41), com o **WhatsApp oficial como canal do paciente** (D34) e a interface própria da nutricionista. A base inicial fica na conta Google dela; a ponte trata os eventos com persistência e retenção a definir. O produto pretende reduzir três dificuldades (D40), benefício ainda a medir no piloto:

1. **Agenda pelo WhatsApp:** o paciente marca, remarca e desmarca sozinho por menus padronizados; a agenda dela se atualiza sem ela gastar tempo.
2. **Acompanhamento padronizado:** entre as consultas, o paciente responde menus e check-ins definidos por ela, sem IA; assuntos clínicos seguem para a profissional, com automação pausada durante o atendimento humano (D38). Textos, prazos e disparos são definidos por ela (D37), em incremento posterior ao primeiro agendamento.
3. **Pacientes que precisam de atenção:** sinais operacionais com motivo e data (D39), para orientar acompanhamento humano. Sem probabilidade ou previsão validada de abandono.

Só os números que ela libera recebem os menus (D36).

**Complemento** (D40), oferecido conforme a necessidade de cada nutricionista: financeiro (cada consulta vira um valor a receber, com código Pix, recibo e relatório do carnê-leão) e os demais módulos. O financeiro é a parte já validada no Google.

## Arquitetura

| Peça | Ferramenta | Papel |
|---|---|---|
| WhatsApp | API oficial da Meta (Cloud API) | Canal do paciente: menus, check-ins e mensagens disparadas por ela (D34, D37) |
| Ponte | Serviço externo mínimo, com tratamento de dados e persistência definidos antes da integração | Valida origem, registra trabalho aceito de forma durável e encaminha comandos/respostas autorizados (D35) |
| API da base Google (chamada “cofre” no desenho) | Apps Script com autenticação entre serviços e autorização por paciente, consulta e consultório; publicação ainda pendente | Executa comandos validados na agenda e planilha configuradas no servidor (D35) |
| Agenda | Google Agenda (e página de agendamento como alternativa) | Fonte das consultas e da rotina dela |
| Base de dados | Planilha Google, com áreas protegidas | Pacientes, consultas, pagamentos, registros |
| Automação | Apps Script ligado à planilha | Sincronização, acompanhamento, relatórios, financeiro, alertas |
| Recibos | Modelo no Google Docs → PDF no Drive dela | Documento para o paciente (complemento) |
| Nutricionista | Interface própria (D33) e, por enquanto, menu da planilha | Liberar/revogar pacientes, acompanhar consultas e ver sinais de atenção; disparos em incremento posterior |

Na implementação validada até agora, os comandos são executados pelo menu da planilha, sem servidor. A ponte e a porta do cofre são as próximas peças (trilha WA de `TAREFAS.md`), detalhadas em [WHATSAPP-PONTE-COFRE.md](WHATSAPP-PONTE-COFRE.md). Não existe IA nesta versão.

### Direção do MVP aprovada em 30/09/2026 (D33)

A nutricionista trabalhará em uma interface gráfica própria; Planilhas guardarão os dados, Apps Script executará as regras e Agenda/Drive continuarão como serviços de apoio. O uso cotidiano não exigirá editar a planilha ou operar seus menus. Essa camada ainda será construída, com acesso restrito e conferência de permissões no servidor. Nenhum novo escopo ou publicação foi realizado nesta consolidação.

As trilhas compartilham contratos (D42). A prioridade é liberar paciente → agendar → visualizar consulta → encaminhar ao humano. B1 implementará primeiro o núcleo e a interface locais com adaptadores simulados; a identidade real e o acesso fora do contexto do menu continuam a provar em UI00/WA03. Pix pela interface (UI02) fica como complemento posterior. Ver [MVP-INTERFACE-GOOGLE.md](MVP-INTERFACE-GOOGLE.md) e [bloco do Claude](CLAUDE-BLOCO-1.md). O editor de planos alimentares e o portal do paciente continuam em recortes posteriores.

## Modelo de dados (abas da planilha)

### Configurações (chave | valor)

| Chave | Exemplo | Observação |
|---|---|---|
| `nome_profissional` | [Nome] | Aparece no recibo |
| `crn` | [CRN] | Aparece no recibo |
| `valor_primeira_consulta_centavos` | 0 | Preenchido pela nutricionista |
| `valor_retorno_centavos` | 0 | Idem |
| `regra_retorno_dias` | 30 | Sugestão de retorno |
| `chave_pix` | [chave] | Usada no Pix copia e cola |
| `nome_recebedor_pix` | [até 25 caracteres] | Campo do padrão Pix |
| `cidade_recebedor_pix` | [até 15 caracteres] | Campo do padrão Pix |
| `calendario_id` | primary | Agenda lida |
| `prefixo_evento_consulta` | Consulta | Identifica eventos de consulta |
| `email_alertas` | [e-mail] | Recebe avisos de falha |
| `id_modelo_recibo` | [id do Docs] | Modelo do recibo |
| `id_pasta_recibos` | [id da pasta] | Onde os PDFs ficam |

### Pacientes
`codigo` (P0001) · `primeiro_nome` · `inicial_sobrenome` · `telefone` · `email` · `modo_acompanhamento` (porta_aberta, leve, proximo) · `autorizou_mensagens_em` · `ativo`

Previsto para a lista de liberados (WA04, ainda não instalado): vínculo verificado entre identificador do canal e paciente, validade da liberação e data de revogação. A primeira mensagem sozinha não identifica qual cadastro deve ser vinculado; o mecanismo de verificação será definido na integração. B1 usa um vínculo fictício exato no adaptador de teste. Nenhuma coluna muda neste planejamento.

### Consultas
`id_evento` · `data` · `hora` · `tipo` (primeira, retorno) · `codigo_paciente` · `status` (marcada, realizada, faltou, cancelada) · `atualizado_em` · `agenda_origem` (preenchida pelo kit: de qual agenda vem a linha; ela não mexe)

- O vínculo evento → paciente é feito pelo e-mail ou telefone de quem marcou. Evento sem paciente conhecido vai para a lista "a identificar".
- O evento só leva o mínimo, como "Consulta — Ana S.". Nenhum dado clínico.

### Pagamentos
`id` · `id_evento` · `codigo_paciente` · `pagador_nome` · `pagador_cpf` (opcional, só para o recibo) · `valor_centavos` · `forma` (pix, cartao, dinheiro, pacote, cortesia) · `status` (a_receber, pago, cortesia) · `data_pagamento` · `link_recibo` · `pacote_inicio` (preenchida pelo kit: início do pacote gasto naquela consulta)

### Pacotes
`codigo_paciente` · `total_consultas` · `usadas` · `valor_centavos` · `inicio`

### Despesas (livro-caixa)
`data` · `descricao` · `categoria` · `valor_centavos` · `link_comprovante`

### Registro
`data_hora` · `modulo` · `nivel` (info, aviso, erro) · `mensagem` — **sem nome de paciente e sem dado de saúde**.

## Fluxos da fase 2a

1. **Sincronizar agenda:** lê os eventos do período, cria ou atualiza linhas em Consultas pelo `id_evento`, preserva ausências na janela; só cancela quando o Calendar confirma evento cancelado, conforme D25.
2. **Gerar a receber:** para consulta marcada ou realizada sem pagamento, cria um pagamento `a_receber` com o valor da tabela.
3. **Registrar pagamento:** pelo menu, a nutricionista marca pago, faltou, cortesia ou pacote.
4. **Pix copia e cola:** gera o texto do Pix com a chave e o valor da consulta.
5. **Recibo:** copia o modelo do Docs, preenche e salva o PDF na pasta dela.
6. **Relatório do carnê-leão:** recebimentos do mês por pagador, em aba e em CSV para o contador.
7. **Alerta de falha:** qualquer erro vai para o Registro e gera um e-mail para `email_alertas`.

## Pix copia e cola (padrão do Banco Central)

Texto no formato EMV, com os campos: `00` versão "01"; `26` conta do recebedor com o identificador `br.gov.bcb.pix` e a chave; `52` "0000"; `53` "986"; `54` valor com ponto e duas casas; `58` "BR"; `59` nome do recebedor (até 25); `60` cidade (até 15); `62` com o identificador da transação; `63` CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF), calculado sobre o texto que termina em `6304`. Confira os detalhes no manual oficial do Pix do Banco Central e valide sempre escaneando com um aplicativo de banco, sem pagar.

## O recibo

Precisa trazer: nome e CRN da nutricionista, nome de quem pagou (e do paciente, se forem pessoas diferentes), valor, data, descrição do serviço e, se ela usar, o CPF do pagador. Nutricionista não é obrigada ao Receita Saúde.

## Limites conhecidos

- Cotas, identidade de execução e permissões do Apps Script precisam ser verificadas para a integração; os testes anteriores comprovam apenas os cenários registrados.
- Preços, categorias, franquias, limites e coexistência da Meta devem ser confirmados em fonte oficial vigente e na conta de teste. Não usar o preço universal do patch como orçamento. Detalhes e fontes em [WHATSAPP-PONTE-COFRE.md](WHATSAPP-PONTE-COFRE.md).
- A capacidade da base em planilhas depende de leituras, volume, concorrência e cotas medidos; nenhum número de pacientes está garantido por esta especificação.
- Gatilho automático mínimo: 1 minuto.
