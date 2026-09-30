# O que está implementado e o que depende de validação no Google

Os testes automáticos (`node --test`) rodam o código contra um Google **simulado** (`tests/apoio/simulacao.js`). Eles provam a lógica, mas **não** provam que o Google se comporta igual. Cada item abaixo precisa ser conferido na planilha e na agenda de TESTE antes de qualquer uso real. Nada disto foi instalado nem enviado com `clasp`.

Legenda: **Implementado** = código e testes prontos · **Validar no Google** = só você consegue conferir, na conta de teste.

## T05 — Sincronizar agenda

**Implementado:** leitura dos eventos, novas linhas em Consultas, sem duplicar, cancelamento (evento cancelado ou sumido), lista "a identificar", primeira x retorno, trava contra duas execuções ao mesmo tempo, gatilho de hora em hora criado uma única vez.

**Validar no Google:**
1. Rode "TESTE: criar dados fictícios" e depois "Sincronizar agenda": a aba Consultas deve ganhar 9 linhas, uma delas sem `codigo_paciente` (a identificar).
2. Rode "Sincronizar agenda" de novo: nenhuma linha nova.
3. Apague um evento de teste na agenda e sincronize: a linha correspondente vira `cancelada`. (O Google devolve o evento apagado com `showDeleted`; confirme que isso acontece com a agenda secundária.)
4. As colunas `data`, `hora` e `atualizado_em` de Consultas devem ficar como texto (2026-10-01, 09:00). Se você já tinha instalado a planilha antes, rode "Instalar/atualizar planilha" de novo para aplicar o formato de texto.
5. "Ativar sincronização automática" cria um gatilho em Apps Script > Gatilhos; rodar duas vezes não cria o segundo. O Google pede a autorização nova (`script.scriptapp`).
6. O período lido é de 30 dias atrás a 120 dias à frente; confirme no Registro a linha "Sincronização: ...".

## T07 — Gerar valores a receber

**Implementado:** uma cobrança por consulta (marcada ou realizada), valor pelo preço configurado, nunca R$ 0,00, sem duplicar, ids `PG000001`, avisos para consulta sem paciente, sem preço ou cancelada com valor em aberto.

**Validar no Google:**
1. Preencha os preços em Configurações (R$ 150,00 = `15000`), sincronize e use "Gerar valores a receber": cada consulta marcada ou realizada ganha uma linha `a_receber` em Pagamentos.
2. Rode de novo: nenhuma linha nova.
3. Deixe um preço em branco: aparece o aviso e nada é criado para aquele tipo.
4. A coluna `valor_centavos` deve ficar como número (não como data nem texto).

## T09 — Recibo em PDF

**Implementado:** validação dos dados, montagem dos campos, cópia do modelo, troca dos campos, PDF na pasta, cópia de trabalho na lixeira, link gravado, não gera recibo duas vezes, recusa modelo com campo desconhecido, criação do modelo e da pasta.

**Validar no Google (o mais arriscado do lote):**
1. **Escopo `drive.file`:** rode "Criar modelo e pasta de recibos", preencha um pagamento pago (Pix, `pagador_nome`, `data_pagamento` AAAA-MM-DD) e use "Gerar recibo da linha selecionada". O PDF deve aparecer na pasta. Se o Google disser "arquivo não encontrado" ou pedir permissão maior, `drive.file` não basta e é preciso decidir com você (D20).
2. Confira no PDF: nome e CRN, pagador, CPF (se preenchido), valor, data, descrição, forma. Sem CPF, a linha some.
3. Confira que o nome do arquivo é `Recibo-PG000001-P9001.pdf` e que não sobrou o arquivo `rascunho-...` fora da lixeira.
4. A troca de campos no Docs (`replaceText`) foi testada só em simulação; confira que valores com acento e vírgula (R$ 1.234,56) saem certos.
5. O visual do PDF (fonte, margens) é do modelo: ajuste no Docs; os campos `{{...}}` precisam ficar.
6. Rodar de novo na mesma linha não gera outro PDF; apagar o link em `link_recibo` libera um novo.

## T10 — Relatório mensal e CSV

**Implementado:** consolidação por pagador, conferência dos totais (recusa sair se não baterem), aba refeita a cada vez, CSV atualizado no mesmo arquivo, nomes de arquivo sem nome de pessoa.

**Validar no Google:**
1. Com pagamentos de teste marcados como pagos no mês, use "Relatório do mês" e confira a aba "Relatório AAAA-MM" contra a soma feita à mão.
2. Abra o CSV no Excel ou Planilhas em português: acentos corretos, colunas separadas, valores com vírgula ("150,00"). Peça à contadora para abrir um exemplo fictício e dizer se o formato serve.
3. Rodar duas vezes no mesmo mês não cria segundo arquivo nem segunda aba.
4. **Em aberto (D21):** venda de pacote no relatório.

## T08 — Menu da planilha

**Implementado:** menu completo (sincronizar, valores a receber, pagamento, consulta, relatório, configuração, teste), ações por linha selecionada, mensagens em português, erros inesperados no Registro e e-mail.

**Validar no Google:**
1. Feche e abra a planilha: o menu "Kit do Consultório" aparece com os submenus. (Só depois de o código ser enviado à conta de TESTE, com a sua confirmação.)
2. Clique numa linha de Pagamentos e use "Marcar como pago (Pix)": a linha vira `pago`, forma `pix`, data de hoje. Selecione várias linhas (arrastando) e repita.
3. Clique numa linha e use "Gerar Pix copia e cola": o texto aparece na janela. **Escaneie/cole num app de banco sem pagar** e confira valor e nome do recebedor (é a validação da T06).
4. A janela de alerta tem tamanho limitado: confirme que o texto do Pix aparece inteiro e dá para selecionar e copiar.
5. Cortesia pede confirmação; consulta de pacote gasta uma consulta na aba Pacotes.
6. Marcar consulta como realizada ou faltou funciona em Consultas.
7. Usar um item na aba errada mostra a mensagem "Abra a aba ..." e não gera e-mail de alerta.
8. Na primeira execução, o Google pede a autorização de todos os escopos declarados (planilha, e-mail, agenda, gatilhos, Docs, Drive).

