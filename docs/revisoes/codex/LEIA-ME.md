# Revisões pelo GitHub — NutriMolda
O Caio autorizou em 30/09/2026 rodadas automáticas: Claude implementa; ChatGPT/Codex revisa e testa; decisões e Google real ficam por último.

## Onde continuar
- Branch de resultados: codex/revisoes. Não incorporar toda esta branch por merge: ela inclui uma base de código histórica. Ler/copiar apenas os artefatos de revisão relevantes.
- PR6: lote integrado T03–T11, claude/desenvolvimento.
- PR8: empacotamento, conferências e esqueleto T20–T24, claude/revisao-piloto-gpkzf2.
- PR9: ferramentas de revisão, claude/ciclo-revisao-xgdaco.
- estado.json registra PR, SHA, parecer e relatório. Comentários têm marcador nutrimolda-codex-review:<PR>:<SHA>.

## Rodada do Claude
1. git fetch origin; ler estado.json/relatórios nesta branch e comentários das PRs.
2. Integrar PR8/PR9 numa única branch de desenvolvimento já monitorada (preferencialmente PR6), preservando suas suítes e documentação. Não fazer merge na main.
3. Corrigir ALTA e MÉDIA, implementar D17 aprovado e acrescentar regressões sem novas dependências. R02 já passou na PR8: preservar a separação de produção e leitura de agenda.
4. Adaptar os testes à API/refatoração quando necessário sem perder os cenários e sem inverter o resultado esperado. Auditorias estáticas não são provas de execução Google.
5. Rodar node --test. Em Node24 se o resumo contar apenas arquivos, rodar também node --test --test-isolation=none --test-reporter=spec para contar casos. Rodar empacotamento e conferir saída real.
6. Commit/push numa das PRs monitoradas e comentar: SHA, achados corrigidos, testes/resultado e pendências. As revisões futuras são acionadas por atualização de commit; comentários sozinhos não acionam a rodada.
7. Aguardar nova revisão pelo mecanismo já configurado no Claude, sem loop de consultas contínuas nem commits vazios. Repetir enquanto houver correções técnicas; não inventar tarefas para consumir créditos.

## Rodada do revisor
Conferir o SHA atual e o histórico de comentários, não duplicar revisões do mesmo SHA. Ler instruções do repositório; baixar snapshot exato e verificar SHAs; revisar diff e cenários herdados relevantes; testar localmente com dados inventados. Publicar relatório por SHA e comentar na PR com marcador.
Não alterar branches do Claude, não fazer merge, não publicar/deploy, não tocar dados reais ou enviar mensagens/e-mails.
Status final local: APROVADO_LOCALMENTE_PENDENTE_GOOGLE quando não houver ALTA/MÉDIA técnica. Isso não significa aprovação total nem implantação concluída.
Só pausar as rodadas quando o lote integrado estiver aprovado localmente, todas as PRs monitoradas fecharem, ou o restante depender exclusivamente do Caio/cliente/Google. Aprovação isolada da ferramenta PR9 não encerra o lote.

## Limites
O saldo de créditos não é acessível ao revisor: não é possível garantir parada automática em 1% restante.
Esta automação revisa commits nas PRs existentes; não inicia nem controla a sessão do Claude. O lado Claude precisa ler os resultados via seu mecanismo já configurado.
Não fazer clasp push, autorizar escopos adicionais ou enviar e-mails reais nesta etapa. Agenda de teste, autorizações Google, leitura Pix no banco, PDF/CSV reais, contabilidade de pacotes e decisões da nutricionista permanecem para o final.
