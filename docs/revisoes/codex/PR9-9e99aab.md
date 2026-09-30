# Revisão PR9
## Parecer
REPROVADO

## Resumo
Commit 9e99aab08475a27f9caa86b5fac3b11b10d27cea, branch claude/ciclo-revisao-xgdaco. Revisei também o avanço desde a50138b: o teste foi renomeado para ciclo-revisao.test.js, resolvendo a colisão com a PR8. Os 176 testes existentes passaram; o conferidor ainda aceita respostas que podem aprovar indevidamente a tarefa.

## Problemas
### P1 [ALTA] scripts/revisao.js, lerResposta (N9-01)
- Trecho: `if (parecer === 'APROVADO' && problemas.some((p) => p.prioridade === 'ALTA'))`
- Problema: APROVADO COM RESSALVAS com P1 ALTA retorna valida:true. O ciclo documentado exige não haver ALTA para prosseguir, mas o conferidor não impõe isso; uma automação baseada no seu sucesso pode encaminhar código com falha grave.
- Correção esperada: separar validade do formato de autorização para avançar e bloquear o avanço para qualquer parecer aprovado com ALTA. Cobrir APROVADO, APROVADO COM RESSALVAS, REPROVADO e as combinações de prioridades. Não confundir resposta estruturada REPROVADO válida com aprovação técnica.

### P2 [MÉDIA] scripts/revisao.js, lerResposta (N9-02)
- Trecho: `maiusculo.includes(p)`
- Problema: NÃO APROVADO é identificado como APROVADO e considerado válido. A procura por substring admite parecer negado ou ambíguo.
- Correção esperada: aceitar uma única opção exata após normalização de espaços/capitalização e recusar negações, múltiplas opções ou texto ambíguo. A decisão técnica não deve depender de palavras contidas em outra frase.

## Testes
Node v24.19.0. 58 arquivos do snapshot anterior conferidos por SHA Git; no novo commit, CHANGELOG.md e scripts/revisao.js foram novamente conferidos pelos respectivos SHAs. tests/ciclo-revisao.test.js é a renomeação do mesmo blob.
node --test: saída 0; node --test --test-isolation=none --test-reporter=spec: 176 casos passaram, 0 falharam.
review/codex/regressoes-pr9.cjs: 2 reproduções, ambas falharam como esperado (ressalvas com ALTA e NÃO APROVADO).
Auditoria herdada review/codex/regressoes-base.cjs: 16 verificações, 2 passaram e 14 falharam; esta branch não incorporou o empacotamento da PR8. Os achados R01–R11 continuam pertencendo à base e estão detalhados em PR6-c160294.md, não foram introduzidos por esta PR.

## Pontos para validar no Google
Esta PR só adiciona ferramentas locais e não exige implantação Google.
Integração pendente do ciclo: docs/CICLO-REVISAO.md ainda descreve copiar/colar e afirma que ChatGPT não acessa o repositório. Neste fluxo autorizado, as respostas são publicadas diretamente no GitHub, branch codex/revisoes e comentários nas PRs 6,8,9. Atualizar o documento para esse transporte e conservar o modo manual como opção. Não montar integração por API paga, navegador ou servidor.
Integrar as mudanças de PR8 e PR9 preservando as duas suítes de revisão e reconciliando README/CHANGELOG/documentação. Não fazer merge na main nem clasp push.
