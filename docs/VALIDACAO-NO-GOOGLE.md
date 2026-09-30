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
