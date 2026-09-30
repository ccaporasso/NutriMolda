# Próximo bloco para executar no Claude Code

Execute o bloco B1 de `docs/CLAUDE-BLOCO-1.md` do Kit do Consultório / NutriMolda. A direção foi atualizada em 30/09/2026 após auditoria. O objetivo é aproveitar o crédito disponível para entregar código local útil, testes e uma interface demonstrável.

Primeiro confira a branch, preserve alterações existentes e parta de `main` atualizado em uma branch de trabalho. Leia `AGENTS.md`, `CLAUDE.md`, `docs/CLAUDE-BLOCO-1.md`, `docs/WHATSAPP-PONTE-COFRE.md`, D33–D44 de `docs/DECISOES.md`, `docs/MVP-INTERFACE-GOOGLE.md` e a prioridade B1 em `docs/TAREFAS.md`. Consulte o restante apenas quando necessário; não releia todo o histórico a cada incremento.

O bloco local está autorizado: apresente um plano curto e prossiga por B1.1, B1.2 e B1.3, nessa ordem, sem pedir nova confirmação entre eles. Não reinicie T00, instalação, login ou testes Google já registrados. Use JavaScript e `node:test`, sem novas dependências. Mantenha o código experimental fora de `src/` e fora do pacote de produção.

Entregue o percurso com dados fictícios: nutricionista libera paciente → paciente escolhe e confirma horário no simulador → consulta aparece na interface → encaminhamento humano pausa a automação. Cubra também paciente sem liberação, expirado ou revogado; acesso à consulta alheia; duplicação; disputa pelo mesmo horário; falha e retomada. Implemente os critérios detalhados do bloco, sem afirmar que o simulador comprova segurança ou persistência em produção.

Não publique serviços, não faça `clasp push`, não altere escopos, não use credenciais reais, não envie mensagens e não contrate serviços. Esses recursos não são necessários para B1. Se uma parte depender deles, registre a pendência e continue a parte local independente. Não abra frentes adicionais: a primeira jornada completa é a prioridade.

Após cada incremento, faça os testes adequados e registre um commit revisável. Ao concluir, rode a suíte existente e os novos testes, monte o pacote de produção para confirmar que o protótipo ficou fora, atualize tarefas e changelog e abra um PR para revisão. Informe comandos, resultados, falhas, testes não executados e limites. Não faça merge automático do novo código. Se o crédito ou o ambiente interromper o trabalho, deixe um checkpoint exato da tarefa concluída e da próxima; não declare o bloco completo.

Explique em português simples o que mudou, como abrir a demonstração e o que falta para conectar Meta e Google de verdade.
