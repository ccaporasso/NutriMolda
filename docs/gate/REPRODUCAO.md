# Como reproduzir a verificação (Gate, itens 17 a 19)

Qualquer pessoa, sem conhecimento informal do projeto, consegue repetir a verificação com um clone limpo e o Node. O projeto **não tem dependências**: não existe `npm install` nem `node_modules`. O `package.json` só fixa a versão do Node e dá nomes curtos aos comandos.

## Requisitos

| Item | Valor | Onde está fixado |
|---|---|---|
| Node mínimo | família **22** (o gate recusa versão menor) | `package.json` (`engines`), `scripts/gate.js` |
| Node recomendado e usado no CI | **22.22.0** | `.nvmrc` (o CI lê este arquivo) |
| Verificado em | 22.22.0 apenas; outras versões, e Windows ou macOS, **não foram testadas** (N/M) | este documento |
| Git | qualquer versão recente; clone **completo** para varrer o histórico (clone raso aparece como N/M) | |
| Dependências | nenhuma | regra 7 do `CLAUDE.md`; o gate falha se o `package.json` ganhar `dependencies` |

## Comando único

```
git clone https://github.com/ccaporasso/NutriMolda.git
cd NutriMolda
git checkout <commit ou branch a verificar>
node --version            # o gate avisa se não for a versão de .nvmrc
node scripts/gate.js
```

Saída esperada (os números mudam quando a suíte cresce; o que importa é cada linha em PASS e a última linha):

```
GATE LOCAL

Ambiente.............. PASS
Estrutura............. PASS
Testes................ PASS
Cobertura............. PASS
Cobertura documentada. PASS
Produção.............. PASS
Escopos............... PASS
Dados de teste........ PASS
Segredos.............. PASS
Histórico do Git...... PASS
Integridade........... PASS
Documentos............ PASS
git diff.............. PASS
Mutação............... N/M

RESULTADO: PASS (1 não medido(s))
```

`Mutação... N/M` significa "não pedida nesta execução". Com `node scripts/gate.js --mutacao --estrito` a linha vira PASS (leva alguns minutos) e o aviso (WARN) também reprova, como no CI. Código de saída diferente de zero em qualquer falha. Aviso e N/M nunca são escondidos nem contados como PASS.

## Cada comando, separado

| Para quê | Comando | O que esperar |
|---|---|---|
| Testes | `node --test` | `# tests N`, `# pass N`, `# fail 0` |
| Cobertura (com piso por módulo crítico) | `node scripts/cobertura.js --exigir` (detalhe: `--detalhe`; gravar a tabela: `--escrever docs/gate/COBERTURA.md`) | tabela por módulo; sai com código 1 se um módulo crítico ficar abaixo de 99% de linhas, 95% de ramos ou 99% de funções |
| Pacote de produção | `node scripts/empacotar-producao.js` | `Pacote de produção montado em dist/producao/`; recusa pacote com arquivo de teste, esqueleto, escrita na agenda ou escopo fora da lista |
| Segurança local (PII, segredos, escopos, histórico) | `node scripts/seguranca.js --historico` | quatro linhas em PASS |
| Mutação manual | `node scripts/mutacoes.js` (gravar o relatório: `--escrever docs/gate/MUTACOES.md`; uma só: `--so M01`) | `N/N mutações detectadas.` |
| Complexidade | `node scripts/complexidade.js` | tabela de funções e candidatas a separar |
| Desempenho | `node scripts/desempenho.js` | tabelas de crescimento e chamadas externas |
| Nota pela régua do Gate v1.0 (autoavaliação; as entradas são `docs/gate/CRITERIOS.md`) | `node scripts/pontuacao.js` (`--json` para máquina) | notas das duas bases (E2 e conservadora), faixa final e os sete eliminatórios |
| Auditoria completa | `node scripts/gate.js --mutacao --estrito` | `RESULTADO: PASS` |

Os nomes curtos do `package.json` (`npm test`, `npm run gate`, `npm run gate:completo`) chamam os mesmos comandos; não instalam nada.

## O que o CI faz (`.github/workflows/ci.yml`)

A cada pull request e a cada push na `main`: checkout com histórico completo, Node de `.nvmrc`, `node --test`, cobertura com piso, `git diff --check` contra a base, pacote de produção, segurança local com histórico e, por fim, `node scripts/gate.js --estrito`. Permissão só de leitura, sem segredos, sem `clasp` e sem envio ao Google. Um segundo job, **consultivo**, roda as mutações.

**Recomendação (não aplicada):** em Settings > Branches, proteger a `main` exigindo o check **"Gate local"**, ao menos uma revisão aprovada e proibindo push direto e force-push. Isso depende de quem administra o repositório e **não foi configurado por esta rodada** (N/M).

**Recomendação (não aplicada):** trocar `actions/checkout@v4` e `actions/setup-node@v4` pelo SHA exato de cada versão, para o CI não mudar sozinho. Os SHAs não foram resolvidos aqui (N/M).

## Limites conhecidos

- O CI só roda depois do primeiro push da branch com o workflow; nenhuma execução do CI foi observada nesta rodada (N/M).
- Os testes rodam num Google simulado (E2). O que só o Google real mostra está em `docs/gate/GOOGLE-REAL.md` (preparado, não executado).
- `docs/gate/COBERTURA.md` e `docs/gate/MUTACOES.md` são geradas pelos scripts; o gate avisa (e o CI reprova) se `COBERTURA.md` ficar desatualizada.
