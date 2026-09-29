# Decisões

Registro das decisões tomadas até 29/09/2026. Mudar qualquer uma exige uma nova entrada, com data e motivo.

| # | Decisão | Motivo |
|---|---|---|
| D1 | O kit roda na conta Google de cada nutricionista, sem servidor próprio | Login, isolamento e proteção ficam com o Google; o risco de vazamento em massa não existe |
| D2 | Aplicativo web hospedado só quando a receita pagar desenvolvimento e revisão de segurança profissionais | Sem isso, um sistema na internet com dados de saúde é o maior risco do projeto |
| D3 | Nenhuma automação não oficial do WhatsApp | Viola os termos, pode banir o número dela e expõe todas as conversas |
| D4 | WhatsApp 24 horas só com provedor oficial, depois do teste técnico (fase 3) | Coexistência exige parceiro da Meta; o provedor é a peça que roda 24 horas |
| D5 | A IA nunca escreve para o paciente | Resolução CFN nº 856/2026: a ferramenta não substitui a nutricionista na interação direta |
| D6 | Sem IA na versão 1. Depois, só API paga ou modelo local, com pseudonimização | Planos gratuitos podem usar os dados e ter revisão humana |
| D7 | Trocas de alimentos mostram o trecho exato da tabela aprovada por ela | Evita resposta inventada; o que não está na tabela vai para ela |
| D8 | Pedidos de ajuste do plano entram numa fila que ela aprova | Nada chega ao paciente sem ela escolher |
| D9 | Três modos de acompanhamento escolhidos pelo paciente; não responder nunca gera cobrança | Presença sem cobrança |
| D10 | Aviso de uso de ferramentas automatizadas e de que não é canal de urgência (CVV 188, SAMU 192) | Código de ética do CFN e segurança do paciente |
| D11 | Modelos de mensagem neutros, sem dado de saúde | Privacidade e aprovação pela Meta |
| D12 | Nenhum dado real antes de: resposta do RH, contrato e aviso de privacidade revisados por advogado, revisão de segurança por uma pessoa | Proteção dos pacientes, dela e sua |
| D13 | Valores em centavos na lógica; fuso América/São Paulo | Evitar erro de arredondamento e de data |
| D14 | Escopos de permissão mínimos, cada um justificado aqui | Menos acesso, menos risco |
| D15 | O código pode ser aberto; a licença será escolhida com o advogado | Confiança da cliente; a renda vem do serviço |
| D16 | `.clasp.json` fica fora do Git; o repositório traz só `.clasp.json.exemplo` (29/09/2026) | O ID do projeto é um identificador real (ver `SEGURANCA-LGPD.md`); cada pessoa aponta para o próprio projeto de teste |
| D17 | Nenhuma cobrança nasce de preço não validado: preço ausente ou zero só gera aviso na configuração, mas `precoParaCobranca` (`src/Configuracoes.js`) bloqueia a cobrança. Cortesia é escolha explícita, nunca um preço zero. A aba guarda centavos inteiros; na interface final (T08) ela digita R$ 150,00 e o sistema converte para 15000 (29/09/2026) | Configuração incompleta não pode virar cobrança de R$ 0,00 por acidente; "150,00" no campo em centavos seria ambíguo |

## Escopos de permissão

Declarados em `src/appsscript.json`. Cada tarefa que precisar de um escopo novo o acrescenta aqui, com o motivo, no mesmo commit.

| Escopo | Para quê | Desde |
|---|---|---|
| `spreadsheets.currentonly` | Ler e escrever **só** a planilha à qual o script está ligado (abas, cabeçalhos, validações, menu). Não dá acesso a outras planilhas do Drive. | T00 |

Previstos, ainda **não** declarados (entram só na tarefa que os usar):

| Escopo | Tarefa | Para quê |
|---|---|---|
| `calendar.readonly` | T05 | Ler as consultas da agenda, sem alterar nada |
| `script.send_mail` | T03 | Enviar o e-mail de alerta de falha |
| `documents` e `drive.file` | T09 | Copiar o modelo do recibo e salvar o PDF na pasta dela |
| `script.scriptapp` | T05 | Criar o gatilho automático de sincronização |
