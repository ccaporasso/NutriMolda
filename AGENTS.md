# Instruções para revisores automáticos (Codex e similares)

Projeto: Kit do Consultório, automações em Google Apps Script para uma nutricionista. Leia `CLAUDE.md`, `docs/ESPECIFICACAO.md`, `docs/DECISOES.md` e `docs/TAREFAS.md`. Responda em português, sem jargão: quem decide não programa.

## Review guidelines

Ao revisar um pull request, confira nesta ordem:

1. A tarefa (`docs/TAREFAS.md`) cumpre os critérios de aceite? Falta ou sobra algo?
2. Erros de lógica: fuso `America/Sao_Paulo`, valores em centavos (inteiros), rodar duas vezes duplica algo (tudo deve ser idempotente), casos de borda (vazio, texto no lugar de número, acentos).
3. O que o Google simulado dos testes não prova (SpreadsheetApp, CalendarApp, DocumentApp, DriveApp, MailApp).
4. Regras de segurança, e qualquer violação é prioridade ALTA: nenhum dado real de paciente; WhatsApp só oficial e sem IA escrevendo ao paciente; nenhum dado de saúde em registros, alertas ou nomes de arquivo; escopos mínimos justificados; nenhuma dependência nova sem decisão. D35 permite planejar a ponte e a API restrita do Apps Script, mas não autoriza publicação por si só. Estado de conversa, fila e deduplicação precisam de localização, retenção e recuperação explícitas; não dizer que a ponte não trata dados. Autenticar a origem e autorizar cada paciente, consulta e consultório. Ver D44 e `docs/WHATSAPP-PONTE-COFRE.md`.
5. Os testes (`node --test`, só `node:test`) cobrem o que importa? Algum passa por engano?

O bloco local autorizado em D44 está em `docs/CLAUDE-BLOCO-1.md`. Seus testes simulados não comprovam identidade no Google, persistência real, entrega pela Meta ou segurança de implantação. Não remover testes existentes para acomodar o protótipo; manter o experimento fora de `src/` e do pacote de produção.

Formato de cada comentário: prioridade (ALTA, MÉDIA ou BAIXA), arquivo e função, o problema e a correção esperada. Não reescreva o projeto, não sugira dependência nova e só aponte o que dá para justificar pelo diff.
