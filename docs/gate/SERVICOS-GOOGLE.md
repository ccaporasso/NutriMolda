# Serviços do Google permitidos no código (registro para o gate)

`node scripts/seguranca.js` falha se `src/` usar um serviço do Google que não esteja nesta lista, ou se `appsscript.json` ganhar um escopo,
serviço avançado, web app ou biblioteca que não esteja previsto. Para liberar um serviço novo é preciso, nesta ordem: (1) escrever o motivo aqui
e a decisão em `docs/DECISOES.md`; (2) acrescentar o nome em `SERVICOS_PERMITIDOS` (ou o escopo em `ESCOPOS_PERMITIDOS`) em `scripts/seguranca.js`;
(3) escrever o teste de uso em `tests/revisao.test.js`. Os escopos continuam justificados um a um na tabela de escopos de `docs/DECISOES.md`.

Estado: lista registrada nesta rodada a partir do que o código já usava; **aguarda confirmação do Caio** (não é decisão nova de escopo).

| Serviço | Para que serve no kit | Escopo exigido |
|---|---|---|
| SpreadsheetApp | Ler e gravar as abas da planilha a que o kit está ligado | `spreadsheets.currentonly` |
| DocumentApp | Preencher o modelo do recibo e exportar o PDF | `documents` |
| MailApp | E-mail de alerta de falha (sem dado de paciente) | `script.send_mail` |
| ScriptApp | Criar o gatilho de hora em hora, uma única vez | `script.scriptapp` |
| PropertiesService | Guardar, na própria planilha, a marca do calendário sincronizado e o dia do último alerta | nenhum |
| LockService | Trava para duas operações não se atropelarem | nenhum |
| Utilities | Formatar datas no fuso de São Paulo e montar o CSV (blob) | nenhum |
| Calendar (serviço avançado v3) | Ler eventos da agenda (produção: só leitura, `calendar.events.readonly`) | `calendar.events` (teste) / `calendar.events.readonly` (produção) |
| Drive (serviço avançado v3) | Copiar o modelo, salvar PDF e CSV, criar modelo e pasta, lixeira; só arquivos que o kit criou | `drive.file` |
| Logger | Último recurso quando o próprio Registro falha; só texto fixo, sem dado de paciente | nenhum |
