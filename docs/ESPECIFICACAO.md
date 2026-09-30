# Especificação — Kit do Consultório, versão 1

## O que é

Um conjunto de automações instalado na conta Google de cada nutricionista. Resolve três dores:

1. **Agenda:** o paciente marca sozinho; ninguém preenche nem apaga horário à mão.
2. **Financeiro:** cada consulta vira um valor a receber, com código Pix, recibo e relatório do carnê-leão.
3. **Acompanhamento:** o paciente não fica sozinho entre as consultas, sem virar tarefa para ninguém (fase 2b).

## Arquitetura

| Peça | Ferramenta | Papel |
|---|---|---|
| Agenda | Google Agenda + página de agendamento | Fonte das consultas e da rotina dela |
| Base de dados | Planilha Google, com áreas protegidas | Pacientes, consultas, pagamentos, registros |
| Automação | Apps Script ligado à planilha | Sincronização, financeiro, recibos, relatórios, alertas |
| Recibos | Modelo no Google Docs → PDF no Drive dela | Documento para o paciente |
| Paciente | Página de agendamento e, na fase 2b, Formulários | Entrada sem instalar nada |
| WhatsApp | Recursos nativos do WhatsApp Business e links wa.me | Fase 3: provedor oficial |

Na implementação validada, os comandos são executados pelo menu da planilha. Não existe servidor próprio, web app público nem IA nesta versão.

### Direção do MVP aprovada em 30/09/2026 (D33)

A nutricionista trabalhará em uma interface gráfica própria; Planilhas guardarão os dados, Apps Script executará as regras e Agenda/Drive continuarão como serviços de apoio. O uso cotidiano não exigirá editar a planilha ou operar seus menus. Essa camada ainda será construída, com acesso restrito e conferência de permissões no servidor. Nenhum novo escopo ou publicação foi realizado nesta consolidação.

A primeira entrega prevista é listar consultas, abrir seus detalhes e gerar o Pix de uma cobrança a receber pela interface. O desenho de acesso e o funcionamento do Apps Script fora do contexto do menu precisam ser comprovados antes dessa entrega. Ver [MVP-INTERFACE-GOOGLE.md](MVP-INTERFACE-GOOGLE.md). O editor de planos alimentares e o portal do paciente pertencem a recortes posteriores, sem implementação nesta rodada.

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

- O Apps Script tem cotas diárias, menores em contas gratuitas: e-mails, chamadas externas e tempo de execução. Conferir na documentação do Google.
- Planilha funciona bem para um consultório, não para milhares de linhas.
- Gatilho automático mínimo: 1 minuto.
