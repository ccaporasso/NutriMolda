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

## Revisão automática (30/09/2026): o que só o Google de verdade confirma

1. **Agenda:** apagar um evento de teste e sincronizar: a consulta vira `cancelada` (a resposta de `Calendar.Events.get` para evento apagado deve trazer `status: cancelled`). Remarcar um evento para 5 meses à frente: a consulta só muda de data. Trocar `calendario_id` por outra agenda: as consultas da agenda antiga ficam como estão (coluna `agenda_origem` preenchida pelo kit) e aparece o aviso, também na segunda sincronização. Planilhas antigas: rodar Instalar/atualizar planilha para completar o cabeçalho da coluna nova.
2. **Preços:** Configuração > Definir preços das consultas (em reais): `180,00` grava `18000`; `1,50` pede confirmação.
3. **Cabeçalho:** trocar duas colunas de lugar em Pagamentos e usar qualquer item do menu: mensagem de cabeçalho diferente, nada gravado.
4. **Pacote:** com `inicio` preenchido em Pacotes, marcar consulta de pacote: pagamento vira pago/pacote e `usadas` sobe uma vez.
5b. **Recibo, cifrão e troca literal:** no PDF gerado, conferir que aparece "R$ 150,00" e "R$ 1.234,56" com o cifrão e sem barra, e que nenhum `{{...}}` sobrou (o kit troca os campos com `findText`/`deleteText`/`insertText`; confirme também num modelo com campo no cabeçalho).
5c. **Grade cheia (M3):** numa cópia de teste, deixar Consultas só com poucas linhas vazias no fim da grade e sincronizar: deve ampliar a grade e gravar sem erro de coordenadas, com data/hora como texto.
5d. **Fuso da planilha (B2 da revisão Opus):** mude o fuso em Arquivo > Configurações para outro, rode "Instalar/atualizar planilha": deve voltar para "(GMT-03:00) São Paulo" com aviso na tela.
5e. **Chave Pix (B5):** com `chave_pix` "529.982.247-25" (CPF de exemplo com pontos), "Gerar Pix copia e cola" recusa e explica; com "52998224725" gera.
5. **Recibo:** apagar `{{valor}}` do modelo e gerar: mensagem de campo obrigatório, nenhum PDF na pasta, nenhum `rascunho-` fora da lixeira.
6. **Gerador de teste:** na primeira vez para a agenda, a pergunta "Esta agenda é só de TESTE?" aparece; Não interrompe sem escrever nada.
7. **Pacotes:** com dois pacotes do mesmo paciente (início 01/09 e 15/09), a consulta de pacote usa só o de 15/09 e o pagamento fica com `pacote_inicio` 2026-09-15. Renovar no mesmo dia (linha nova com início de hoje) não muda o pacote antigo.
8. **Relatório:** dois pagamentos com o mesmo nome, um com CPF e outro sem: duas linhas e um aviso.

## T09 — Recibo em PDF

**Implementado:** validação dos dados, montagem dos campos, cópia do modelo, troca dos campos, PDF na pasta, cópia de trabalho na lixeira, link gravado, não gera recibo duas vezes, recusa modelo com campo desconhecido, criação do modelo e da pasta.

**Validar no Google (o mais arriscado do lote):**
1. **Escopo `drive.file` (D20/D32):** confirme em Serviços que o serviço avançado Drive v3 está ativado e autorizado. O kit cria agora o modelo por `Drive.Files.create` e o preenche pelo Docs. Rode "Criar modelo e pasta de recibos", preencha um pagamento pago (Pix, `pagador_nome`, `data_pagamento` AAAA-MM-DD) e use "Gerar recibo em PDF" (submenu Pagamento). O PDF deve aparecer na pasta. “Arquivo não encontrado” exige investigar o arquivo e seu acesso pelo app; por si só não demonstra que é necessário ampliar o escopo. Confira também o CSV do relatório do mês (mesma pasta).

   **Reteste da falha observada em 979b202, somente na cópia descartável:** instale a correção D32; anote/preserve o id e o conteúdo do modelo antigo; esvazie apenas `id_modelo_recibo`, mantendo `id_pasta_recibos`. Rode "Criar modelo e pasta de recibos" e repita: deve criar um modelo novo na primeira vez e nada na segunda. Não se espera que o código substitua automaticamente um modelo já configurado. Gere os recibos dos pagamentos fictícios de 15000 e 123456 centavos, confira `R$ 150,00`, `R$ 1.234,56`, campos substituídos e aparência. Repita cada emissão: mesmo link e um PDF por pagamento, nenhum rascunho fora da lixeira. Até passar no Google, a correção permanece candidata.
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

## R4 — Pacote de produção (escopo somente leitura da agenda)

**Implementado:** `node scripts/empacotar-producao.js` monta o pacote sem o gerador de dados fictícios e com `calendar.events.readonly`; testes automáticos conferem arquivos, nomes, marcas de teste e escopos.

**Validar no Google (só na conta de TESTE, com o seu ok):**
1. Monte o pacote e envie **para o projeto de TESTE** (não para a cliente), ou troque a lista de escopos do projeto de teste pela de `dist/producao/appsscript.json`.
2. Autorize de novo: a tela deve pedir só leitura da agenda.
3. Rode "Sincronizar agenda" na agenda de teste. **Esperado:** funciona como antes. **Se der erro de permissão:** pare e investigue a causa (a documentação do Google lista `calendar.events.readonly` para `Events.list`). A produção continua somente leitura; ampliar escopo só com decisão prévia do Caio (D23).
4. O menu não mostra "Somente na conta de TESTE".
