# Revisão PR6 — a2ffd09

## Parecer
REPROVADO

## Resumo
PR6, branch `claude/desenvolvimento`, SHA completo **a2ffd099e1024bf1ae3429f44db63abc3f031347**, revisado em 30/09/2026. Comparação com `4682127fc3abfbc21b5f34de08fb445c73a6eae1`. Conferidos os **84 blobs** do snapshot local contra a árvore Git obtida do GitHub: nenhuma divergência.

As **sete reproduções da última rodada passaram**. Também passaram os 26 casos anteriores e os dois N8, totalizando **35/35 regressões independentes**. P1 (pacotes), P2 (colisão de agendas) e P4 (instalador) da revisão anterior estão resolvidos nos cenários revisados. P3 melhorou, mas permanece incompleto em dois caminhos da criação/limpeza de dados de teste. Há **1 ALTA e 1 MÉDIA**; não avançar para instalação/validação do lote ainda.

## Problemas

### P1 [ALTA] src/DadosTeste.js — planejarLimpezaDeTeste; src/GeradorTeste.js — apagarDadosDeTeste (R03i)
- Trecho: `const daAgendaDeTeste = (c) => !c.origem || !origemTeste || c.origem === origemTeste;`.
- Problema: origem vazia é tratada como prova de pertencimento à agenda de teste. A migração adiciona o cabeçalho `agenda_origem`, mas não preenche as linhas. O apagador passa esse vazio diretamente e não consulta a última sincronização nem comprovação de geração.
- Reprodução: consulta herdada com um dos nove IDs reservados, origem vazia e pagamento ligado; a propriedade `calendario_da_ultima_sincronizacao` aponta para uma agenda anterior, diferente da agenda atual de teste. A agenda atual não devolve nenhum evento. Após confirmar a limpeza, **consulta e pagamento foram apagados**, mesmo sem prova de que pertenciam à agenda atual. O código do paciente usado é fictício, P0001.
- Correção esperada: vazio/ausência de origem não autoriza apagar. Preservar consultas e pagamentos sem comprovação; oferecer aviso e tratamento seguro das linhas legadas. Não atribuir cegamente a agenda atual às linhas antigas para liberar limpeza. Manter a limpeza normal para ID exato + origem comprovada e o caso de consulta fictícia ainda sem paciente identificado. Sem ampliar escopos.
- Os testes de `dados-teste.test.js` que passam linhas sem origem e esperam exclusão não provam o contrato de procedência: ajustar suas entradas com prova explícita quando esperam apagar. A expectativa anterior de preservar dados sem prova continua a mesma; esta reprodução amplia R03f na migração já suportada.

### P2 [MÉDIA] src/GeradorTeste.js — criarDadosDeTeste (R03k)
- Trecho: `try { existente = Calendar.Events.get(id, e.id); } catch (erro) { existente = null; }`.
- Problema: qualquer falha de leitura vira “ID livre”. A nova pré-conferência promete interromper antes de escrever quando não consegue conferir colisões, mas engole erros de cota, acesso e indisponibilidade.
- Reprodução: todos os `Events.get` lançam erro fictício de cota; os métodos de escrita são observáveis no mock. O gerador faz **9 tentativas de escrita na agenda e acrescenta 6 pacientes**, em vez de parar antes de qualquer gravação. O mock não afirma que o Google aceitaria essas inserções; prova que o código as tenta e que a planilha é alterada sem pré-checagem concluída.
- Correção esperada: distinguir ausência confirmada de erro/resultado desconhecido. Qualquer erro que não comprove ausência deve interromper a pré-conferência antes de gravar pacientes ou eventos. Tratar ausência por mecanismo específico e testável do serviço; não usar o texto arbitrário de qualquer exceção como liberação. Preservar os casos de agenda nova, segunda execução, recriação de evento comprovadamente gerado e colisão com evento cancelado sem marca. Manter a proteção do Registro/Logger.
- Caminho herdado, agora usado pela pré-conferência introduzida neste diff; é uma continuação do contrato R03h, não uma falha nova atribuída à API Google.

## Testes
Node v24.19.0; dados inventados; serviços Google em memória. Lidos AGENTS, CLAUDE, ESPECIFICACAO, DECISOES, SEGURANCA-LGPD, TAREFAS, VALIDACAO, manuais e comentários da PR.

| Execução | Resultado observado |
|---|---|
| `timeout 20 node --test` | Saída 124; 25 arquivos passaram, 1 cancelado no teste com subprocessos. **Sem sucesso integral declarado.** |
| `node --test --test-isolation=none --test-reporter=spec --test-skip-pattern='conferir e salvar'` | **318 casos passaram**, zero falhas na seleção; excluído apenas o teste de subprocessos. |
| CLI real em shell, `cli-pr9-2dd59b4.sh` | **7/7 códigos esperados**, saída 0. Não substitui uma aprovação do teste nativo bloqueado. |
| PR6-4682127 + PR6-b12b35e + regressoes-pr8 | **35/35 passaram**: os 7 da última revisão + 26 anteriores + 2 N8. |
| regressoes-pr9, sem N9-03 de subprocesso | **2/2 passaram**; CLI coberto acima. |
| PR6-a2ffd09.cjs | **1 controle passou; 2 reproduções falharam**, confirmando R03i e R03k. |
| `node scripts/empacotar-producao.js` | Saída 0; **28 JS + manifesto**. |

O controle independente de produção executa o menu dos arquivos reais em `dist/producao`, compara os conteúdos com o pacote esperado e confere o manifesto: sem DadosTeste/GeradorTeste nem submenu de teste; preços em reais presentes; `calendar.events.readonly`, Drive v3 e `drive.file`; nenhum `drive` completo. R02/D17 preservados.

Artefatos: `review/codex/PR6-a2ffd09.cjs` e `docs/revisoes/codex/PR6-a2ffd09-resultados.txt`. Executar da raiz do SHA alvo; usar os arquivos da branch `codex/revisoes` sem fazer merge dessa branch no código.

## Próxima rodada do Claude
Corrigir somente as pendências acima e preservar as regressões anteriores. Acrescentar casos para origem ausente/legada, erro de leitura e ausência realmente confirmada; manter controles positivos de criação/limpeza e consulta a identificar. Atualizar manuais e mensagens: a limpeza não apaga Pacotes e preserva linhas sem prova; a confirmação atual ainda anuncia Pacotes apesar de eles serem preservados. Rodar testes/empacotamento, commit/push na PR6 e registrar resposta.

Não pedir novo ok para estas correções: já estão autorizadas no ciclo. Sem nova PR, merge na main ou clasp push. Não criar commits vazios nem consultas contínuas. Comentários não são novos commits e não garantem acionar o revisor. A automação previamente registrada permanece sem alteração nesta rodada.

## Pontos para validar no Google
Depois de retirar ALTA/MÉDIA: conta/agenda de teste e autorizações, migração real, alerta a destinatário autorizado, Pix no banco sem pagar, PDF/CSV reais com Drive v3/drive.file, leitura da agenda pelo pacote de produção, decisões contábeis de pacotes e piloto. T20–T24 continuam esqueleto, com decisões da nutricionista pendentes.

Nenhum navegador, dado real, credencial, dependência nova, alteração na branch do Claude, merge ou instalação no Google nesta rodada. **Ainda não APROVADO_LOCALMENTE_PENDENTE_GOOGLE.**
