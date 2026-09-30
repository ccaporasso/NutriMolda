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

## T09 — Recibo em PDF

**Implementado:** `src/Recibo.js` (confere os campos, formata valor/data/CPF, decide se mostra "Paciente: ...", nome do arquivo só com código) e `src/ReciboPdf.js` (copia o modelo, troca os marcadores, salva o PDF na pasta, grava o link em `link_recibo`, apaga a cópia). Item de menu "Gerar recibo da linha selecionada (aba Pagamentos)". Não depende da T07: lê direto a linha da aba Pagamentos, que a T07 vai preencher (interface: `gerarReciboDaLinha_(numeroDaLinha)`; a T08 pode chamá-la).

**Validar no Google:**
1. **Permissão do Drive (o mais provável de dar problema).** O escopo declarado é `drive.file`, que só enxerga arquivos criados pelo próprio script. Se o modelo e a pasta foram criados à mão por ela, o Google pode recusar e a mensagem será "Não consegui abrir o modelo/a pasta". Nesse caso a alternativa é o escopo `drive` (todo o Drive): é uma decisão sua, não foi feita.
2. Crie um Google Docs de modelo com estes marcadores (escritos com chaves duplas): `{{nome_profissional}}`, `{{crn}}`, `{{pagador_nome}}`, `{{valor}}`, `{{data_pagamento}}`, `{{descricao}}`, e opcionalmente `{{numero}}`, `{{data_emissao}}`, `{{pagador_cpf_linha}}`, `{{paciente_linha}}`. Crie uma pasta no Drive. Ponha os dois ids em `id_modelo_recibo` e `id_pasta_recibos`.
3. Na aba Pagamentos, uma linha de teste com `status` pago, `pagador_nome`, `valor_centavos` (15000) e `data_pagamento` (2026-09-30). Clique nessa linha e use o menu. O Google pede a autorização nova (`documents`, `drive.file`).
4. Confira o PDF: campos preenchidos, formatação do modelo preservada (fonte, tamanho, tabela), nenhum `{{` sobrando, e a linha correspondente com o link em `link_recibo`.
5. Clique de novo na mesma linha: deve avisar que já tem recibo. Nome com `$` ou `\` no pagador: confira se sai igual (o `replaceText` do Google pode tratar `$` de modo especial; não foi possível testar).
6. A cópia temporária `TEMP_...` não deve sobrar na pasta (vai para a lixeira).
7. Modelo sem um marcador obrigatório: a mensagem deve listar qual falta e nenhum PDF é criado.

