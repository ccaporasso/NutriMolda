# Protótipo local B1 (D44): primeiro agendamento pelo WhatsApp, com dados fictícios

**É um experimento fora de `src/` e fora do pacote de produção.** Usa só adaptadores simulados em memória. Não prova identidade no Google, persistência após perda do processo, entrega pela Meta nem segurança de implantação (WA02, WA03, WA09 e a revisão independente da D43 continuam pendentes). Nenhum dado real, credencial, serviço externo ou mensagem é usado.

## Como abrir a demonstração

```
node prototipo/interface/servidor.js
```

Abra http://127.0.0.1:4173/ (a porta muda com `PORT=4200 node ...`). O servidor só escuta nesta máquina. `Ctrl+C` encerra. Reiniciar a demonstração (botão nas "Ferramentas") apaga só os dados fictícios.

Roteiro de 2 minutos:
1. No simulador, envie `MENU` com a Paciente Fictícia Um: nada acontece (sem liberação).
2. No painel, **Liberar 30 dias**. Envie `MENU` de novo: aparece o menu.
3. **Ver horários** → escolha um horário (ainda não reserva) → **Confirmar**.
4. A consulta aparece em "Consultas"; **Abrir detalhes** mostra paciente, horário e origem.
5. **Falar com a nutricionista**: a paciente fica "precisa de você" e `MENU` deixa de responder. **Retomar automação** volta ao menu.
6. Em "Ferramentas": **Ocupar por fora o horário** antes de confirmar mostra o conflito; **Falha depois de reservar** seguido de Confirmar e **Reconciliar pendências** mostra a recuperação sem duplicar; **Avançar 1 dia** e repetir mostra a expiração.

## Arquivos

| Arquivo | Papel |
|---|---|
| `whatsapp/contrato.js` | erros neutros, validação, relógio, fuso `America/Sao_Paulo`, geração de horários a partir da configuração de teste |
| `whatsapp/adaptadores.js` | repositórios simulados por consultório (cadastro/liberação, conversa, operações, saída), falhas injetáveis, adaptador "confiável" que emite contextos |
| `whatsapp/nucleo.js` | autorização, liberação/revogação/pausa, máquina de estados, idempotência, despacho com revalidação |
| `whatsapp/agenda-simulada.js` | agenda com reserva atômica e idempotente |
| `whatsapp/agendamento.js` | ver horários, escolher, confirmar e reconciliação |
| `whatsapp/cenario.js` | consultório fictício montado (usado por testes e pela demonstração) |
| `interface/` | servidor local, API fina sobre o núcleo e página (HTML/CSS/JS sem dependências externas) |

| `ponte/meta.js` | (WA01) assinatura `X-Hub-Signature-256`, webhook da Meta -> evento do núcleo, núcleo -> corpo de mensagem da Meta (texto, botões, lista) |
| `ponte/ponte.js` | (WA02) ponte simulada: assinatura -> normalização -> diário em disco com fsync -> só então 200; processamento e saída separados, recuperáveis e idempotentes |

Testes: `tests/bloco1-nucleo.test.js`, `tests/bloco1-agendamento.test.js`, `tests/bloco1-interface.test.js`, `tests/bloco1-ponte.test.js`.

## Ponte e formato da Meta (itens 1 e 2, só local)

Não há endpoint HTTP: a ponte é uma biblioteca chamada pelos testes (`receber(corpoBruto, assinatura)` devolve o status que o servidor real responderia: 401 assinatura inválida, 400/413 corpo ruim, 503 se não gravou, 200 só depois de gravar). O formato dos webhooks, os limites de botões/listas e a assinatura foram escritos a partir da documentação pública conhecida e **precisam ser conferidos na documentação vigente e na conta de teste (WA00)**. O diário (`diario.jsonl`, 0600) guarda só id do evento, consultório, identificador do canal, comando e parâmetros, nunca o texto da conversa; retenção em `compactar`; é descartável e NÃO é a persistência de produção (WA09). Reenvio da Meta, queda antes/depois do núcleo, linha torta no fim do arquivo, revogação entre etapas e falha do transporte estão cobertos. O transporte de saída é um objeto simulado: nada é enviado.

## Contrato final (B1)

- **Contexto:** só o adaptador confiável fabrica contextos (`papel`: profissional, paciente ou sistema; consultório; canal ou profissional). Contexto ausente, forjado ou de outra instância é recusado antes de tocar qualquer repositório; consultório do pedido diferente do contexto também.
- **Vínculo:** canal ↔ código do paciente, por consultório, comparação exata (sem nome e sem ajuste de dígito). O canal vem do contexto, nunca do corpo do evento.
- **Liberação:** id, versão, concedida por/em, validade (ISO com fuso, futura e até 365 dias) e revogação. Expiração prevalece sobre qualquer estado; `PARAR` e revogação não se desfazem com `MENU`.
- **Evento do paciente:** `{ consultorioId, eventoId, comando, parametros: { opcaoId?, versao? }, chaveIdempotencia? }`. Comandos: `menu`, `parar`, `ver_horarios`, `falar_com_nutricionista`, `escolher_horario`, `confirmar`, `texto_livre` (descartado). Texto do paciente nunca é guardado.
- **Idempotência:** chave (padrão = `eventoId`) ligada à impressão digital de consultório + evento + paciente + comando + parâmetros. Mesmo conteúdo devolve o resultado guardado (`repetido: true`); conteúdo diferente é recusado (`CHAVE_REUTILIZADA`).
- **Estados:** `menu`, `escolhendo_horario`, `aguardando_confirmacao`, `consulta_confirmada`, `atendimento_humano`, `revogado` (mais `sem_liberacao` como resultado neutro). Comando fora da etapa, botão antigo (versão da conversa), opção forjada ou posição no lugar do ID: resultado `sem_efeito`, sem gravação e sem saída.
- **Reserva:** `reservar` é atômica e idempotente pela chave; um paciente tem uma consulta futura ativa; conflito devolve novas opções sem o horário ocupado. Resultado incerto deixa a operação `pendente`; repetir o evento ou `reconciliarPendentes` acha a reserva pela chave. Consulta gravada nunca é desfeita por revogação: só se bloqueia novo efeito automático.
- **Saída:** fila com chave própria (não duplica), revalidação de autorização e de pausa no momento do envio; só a confirmação de `PARAR` e o aviso de encaminhamento passam sem liberação. O "envio" é simulado.
- **Registro:** só nome do evento, código de resultado e código do paciente. Sem telefone, nome, corpo de conversa ou dado clínico.
- **Consultas:** profissional vê as do seu consultório; paciente só a própria; alheia e inexistente são indistinguíveis (`NAO_ENCONTRADA`).

## O que falta para a integração real

Persistência durável e fila (WA02/WA09); identidade e API autenticada no Apps Script, propriedade da consulta e escopos (WA03/UI00); vínculo verificado do canal (WA04); conta e número de teste da Meta, assinatura dos webhooks e regras de modelos/janela (WA00/WA01); reconciliação com alterações feitas direto no Google Agenda; autenticação da interface da profissional; adaptador de planilha (caso 12: o preparo de valores `whatsapp/planilha-segura.js` e a interface estão testados; falta o adaptador em si); revisão independente (D43). Remarcação, cancelamento, check-ins e editor alimentar ficam fora do B1.
