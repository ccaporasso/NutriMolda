# Revisão do próprio código (T00 a T11)

Data: 30/09/2026. Revisão feita pelo Claude Code, lendo todo o código de `src/` e os documentos contra `docs/ESPECIFICACAO.md`, `docs/DECISOES.md`, `docs/SEGURANCA-LGPD.md` e as regras do `CLAUDE.md`. É revisão de quem escreveu o código: **não substitui** a revisão de segurança por uma pessoa desenvolvedora (exigida antes do primeiro dado real, ver `docs/SEGURANCA-LGPD.md`).

Regra desta revisão: só foi corrigido o que era claro e local (documentos e dados de teste). Tudo que muda comportamento ou permissão do Google está na seção "Dúvidas para o Caio", **sem** mudança no código.

## O que foi conferido contra a especificação

| Ponto da especificação | Onde está | Resultado |
|---|---|---|
| Abas e colunas (Configurações, Pacientes, Consultas, Pagamentos, Pacotes, Despesas, Registro) | `src/Esquema.js` | Conforme. A aba Despesas existe, mas nada a usa ainda. |
| 13 chaves de Configurações | `src/Esquema.js`, `src/Configuracoes.js` | Conforme. `regra_retorno_dias` é lida e validada, mas nenhum fluxo a usa ainda. |
| Fluxo 1, sincronizar agenda (só lê a agenda, evento sem dado clínico, vínculo por e-mail ou telefone, cancelados) | `src/Agenda.js`, `src/SincronizarAgenda.js` | Conforme, com uma divergência com a D19 (dúvida 5). |
| Fluxo 2, a receber (consulta marcada ou realizada, valor da tabela) | `src/Pagamentos.js` | Conforme, com um risco no preço digitado em reais (dúvida 1). |
| Fluxo 3, registrar pagamento pelo menu | `src/Menu.js`, `src/Acoes.js` | Conforme. |
| Fluxo 4, Pix copia e cola (campos 00, 26, 52, 53, 54, 58, 59, 60, 62, 63; CRC16 0x1021, início 0xFFFF) | `src/Pix.js` | Conforme nos testes. **Falta escanear no app do banco** (só você consegue). |
| Fluxo 5, recibo (nome e CRN, pagador, paciente se diferente, valor, data, descrição, CPF opcional) | `src/Recibo.js`, `src/GeradorRecibo.js` | Conforme. Falta validar `drive.file` no Google. |
| Fluxo 6, relatório do carnê-leão por pagador, em aba e em CSV | `src/Relatorio.js`, `src/GerarRelatorio.js` | Conforme. Pacote fica em aberto (D21). |
| Fluxo 7, alerta de falha (Registro e e-mail) | `src/Alertas.js`, `src/Registro.js` | Conforme; problema de uso na tela não gera e-mail (D22). |
| Sem servidor, sem web app, sem WhatsApp não oficial, sem IA | todo `src/` | Conforme, agora conferido por teste (`tests/revisao.test.js`). |
| Nada de dado de saúde em Registro, e-mail de alerta ou nome de arquivo | `src/Registro.js`, `src/Recibo.js`, `src/Relatorio.js` | Conforme, conferido de ponta a ponta em `tests/integracao.test.js` e `tests/falhas.test.js`. |
| Dinheiro em centavos inteiros, fuso `America/Sao_Paulo` | `src/Formatos.js`, `src/appsscript.json` | Conforme. |
| Scripts idempotentes | instalador, sincronização, a receber, recibo, relatório | Conforme, conferido rodando cada um duas vezes. |
| Escopos mínimos, cada um justificado | `src/appsscript.json`, `docs/DECISOES.md` | Conforme; todo escopo é usado e nenhum uso ficou sem escopo (teste novo). |

## O que a revisão corrigiu

1. `docs/DECISOES.md`: as linhas dos escopos `documents` e `drive.file` estavam separadas da tabela por uma linha em branco e apareciam como texto solto. Juntadas à tabela.
2. `docs/VALIDACAO-NO-GOOGLE.md`: citava o item de menu "Gerar recibo da linha selecionada", que não existe. O nome no menu é "Gerar recibo em PDF".
3. `docs/MANUAL-NUTRICIONISTA.md`: o item "Marcar como pago (Pix / cartão / dinheiro)" foi reescrito com os três nomes reais do menu.
4. `docs/PRIMEIROS-PASSOS.md`: dizia que só apareceria o arquivo `Principal.gs`; agora são vários arquivos.
5. `tests/dados-teste.test.js`: usava um endereço num domínio real (Gmail) como exemplo; trocado por `alguem@exemplo.invalid`.

Para não voltar a acontecer, `tests/revisao.test.js` confere sozinho: nomes de menu citados nos manuais, tabela de escopos, escopos usados x declarados, ausência de web app, WhatsApp não oficial e IA, e que só existem endereços de e-mail e CPFs de exemplo no repositório.

## Dúvidas para o Caio (nada disto foi mudado no código)

Ordem: da mais importante para a menos. "Sugestão" é o que eu faria, para você aprovar ou não.

| # | Dúvida | Por que importa | Sugestão |
|---|---|---|---|
| 1 | **Preço digitado em reais passa sem aviso.** Se ela digita `150` em `valor_primeira_consulta_centavos` (querendo R$ 150,00), o kit cria cobranças de **R$ 1,50**. O aviso "abaixo de R$ 10,00" existe em `src/Configuracoes.js`, mas nenhuma tela o mostra (`lerConfiguracoes().avisos` é ignorado). Conferido rodando o fluxo: 8 cobranças, cinco de R$ 1,50, nenhum aviso. | Cobrança errada no Pix e no recibo. A D17 quer justamente evitar cobrança por preço mal configurado. | Mostrar os avisos de preço na janela de "Gerar valores a receber" e, para preço abaixo de R$ 10,00, **recusar** até ela confirmar. |
| 2 | **Sincronizar exige a configuração inteira**, inclusive chave Pix, CRN e nome do recebedor, que a agenda não usa. | Ela não consegue nem trazer a agenda antes de configurar o Pix. | Exigir só o que cada função usa (agenda: `calendario_id`, `prefixo_evento_consulta`). |
| 3 | **Gatilho automático com configuração errada manda um e-mail por hora** (até 24 por dia), pela mesma falha. O mesmo vale para "Outra sincronização em andamento". | Enche a caixa dela e gasta a cota diária de e-mails. | No gatilho, não enviar e-mail para problema de uso e enviar no máximo um alerta por dia por módulo. |
| 4 | **Cobrança nasce para consulta futura** (marcada, até 120 dias à frente). A especificação diz "marcada ou realizada", então está conforme. Mas cancelar depois gera aviso e cobrança em aberto. | Aba Pagamentos enche de linhas de consultas que ainda não aconteceram. | Manter como está, ou só gerar a partir do dia da consulta. Decisão sua e dela. |
| 5 | **Cancelada à mão volta a marcada.** Se ela troca o status para `cancelada` na planilha mas o evento continua na agenda, a próxima sincronização volta para `marcada`. A D19 diz que status ajustado à mão nunca é sobrescrito. | Cancelamento feito só na planilha desaparece sozinho. | Deixar claro no manual que cancelar é na agenda (já é o caminho normal), ou só reativar consulta que o kit mesmo cancelou. |
| 6 | **Escopo de agenda em produção.** `calendar.events` permite criar e apagar eventos, mas a produção só lê. O pacote de produção (item 4 desta entrega) troca por `calendar.events.readonly`. | Permissão mínima (regra 5). | Aprovar a troca, **depois de validar no Google** que a leitura funciona com o escopo menor. Se não funcionar, investigar a causa e voltar a perguntar: ampliar escopo só com decisão prévia sua. |
| 7 | **Venda de pacote no relatório** (D21 em aberto): a aba Pacotes não guarda a data de recebimento. Também não há recibo da venda do pacote. | O carnê-leão pode ficar sem esse rendimento. | Perguntar à contadora (está na lista de dúvidas da nutricionista) antes de mudar a aba. |
| 8 | **Aba "Relatório AAAA-MM" guarda nome e CPF dentro da planilha**, além do CSV na pasta. | Mais um lugar com dado pessoal. | Manter (é o que ela confere na tela) e lembrar no manual de compartilhar a planilha só com quem precisa. Já consta em "Cuidados". |
| 9 | `criarDadosDeTeste` e `apagarDadosDeTeste` **não usam** `executarNoMenu_`: com agenda errada mostram o erro cru do Google em vez de uma janela. O teste atual (`tests/dados-teste.test.js`) exige esse comportamento. | Só afeta a conta de teste; mensagem menos clara. | Embrulhar, junto com a separação teste/produção. |
| 10 | **Recibo: PDF criado, mas falha ao gravar o link.** Na nova tentativa sai um segundo PDF com o mesmo nome. Muito raro. | Recibo duplicado na pasta. | Antes de criar, procurar PDF com o mesmo nome na pasta. |
| 11 | "Criar modelo e pasta de recibos" e "Relatório do mês" **não usam a trava** das outras ações. | Dois cliques rápidos podem criar dois modelos. | Usar `comTrava_`. |
| 12 | Seleção com Ctrl+clique (vários blocos) só considera o **primeiro bloco**. | Ela pode achar que marcou tudo. | Documentar: selecionar arrastando (já está no roteiro do piloto). |
| 13 | Registro grava uma linha de "Sincronização" **a cada hora**, mesmo sem mudança (cerca de 8.700 linhas por ano). | Registro fica poluído e esconde o que importa. | Gravar só quando houver mudança ou erro. |
| 14 | `exceptionLogging: STACKDRIVER` no manifesto envia erros **não tratados** ao Google Cloud do projeto. O kit trata os erros conhecidos, mas um erro não tratado guarda a mensagem do Google. | Poderia guardar texto de erro com dado. Fica só na conta dela. | Trocar para `NONE` se a revisão de segurança preferir. |
| 15 | Aviso de configuração de recibo cita "T09" (código interno de tarefa). Hoje ninguém o vê (ligado à dúvida 1). | Quando os avisos passarem a aparecer, o texto precisa falar português de consultório. | Trocar o texto junto com a dúvida 1. |

## Limites desta revisão

- O Google **não** foi tocado: tudo foi conferido contra o Google simulado. O que só a conta de teste confirma continua em `docs/VALIDACAO-NO-GOOGLE.md` e no roteiro `docs/ROTEIRO-PILOTO.md`.
- Dados de paciente: nenhum. Todos os testes usam nomes, e-mails (`exemplo.invalid`) e CPFs de exemplo.
