# Inventário do código: o que é produção, experimental, esqueleto ou teste (Gate, item 35)

Classificação de cada arquivo de `src/`, conferida por `tests/inventario-codigo.test.js` (a tabela abaixo precisa bater com o que o código declara, senão o teste falha).

- **PRODUÇÃO**: chamado por menu, gatilho ou por outro arquivo de produção; vai no pacote de produção.
- **EXPERIMENTAL**: roda, mas ainda não é aceito como funcionalidade. **Hoje não há nenhum.**
- **ESQUELETO**: lógica pura testada, sem ponto de entrada, com valores ainda decididos pela nutricionista (`PENDENTE Pn`, D24). **Fica fora do pacote de produção.**
- **TESTE**: gerador de dados fictícios; só existe no projeto de teste (R4, T04).

## Achado A-16 e o que mudou

- **ACHADO:** os cinco arquivos de esqueleto (T20 a T24) viajavam no pacote de produção, ou seja, iam para o Google da nutricionista, apesar de nada os chamar (D24: "nada instalado no Google"). Código sem uso na conta dela aumenta o que precisa ser revisado e dá a impressão de que as funções existem.
- **CORREÇÃO:** `scripts/empacotar-producao.js` ganhou `ARQUIVOS_ESQUELETO` e deixa esses cinco arquivos de fora do pacote de produção; `verificarPacoteProducao` recusa um pacote que os leve ou que use algum nome definido neles. O projeto de TESTE (`src/` inteiro) continua com eles, e os testes de comportamento deles (`fase2b.test.js`, `presenca.test.js`, `modos.test.js`, `frases.test.js`, `fila-ajustes.test.js`, `respostas.test.js`) continuam rodando.
- **Como voltar a incluir um esqueleto:** quando a tarefa virar funcionalidade (menu ligado, pendências Pn respondidas), tirar o arquivo de `ARQUIVOS_ESQUELETO` no mesmo commit que liga o menu. O teste `nenhum arquivo fora dos esqueletos usa o que um esqueleto define` obriga a decisão a ser explícita.
- **Impacto para a nutricionista:** nenhum (nada chamava esses arquivos). **Impacto para o Caio:** o pacote de produção tem 23 arquivos em vez de 28; ao ligar T20 a T24 no futuro, lembrar de tirá-los da lista.
- **Evidência:** E2 (`tests/inventario-codigo.test.js`, 9 casos) e E3 (a varredura dos nomes). O que o Google faz com arquivos extras em `clasp push` não foi observado (N/M).

## src/

| Arquivo | Classe | Linhas | O que faz |
|---|---|---|---|
| `Acoes.js` | PRODUÇÃO | 136 | Regras puras das ações do menu (pagar, cortesia, pacote, realizada) |
| `Agenda.js` | PRODUÇÃO | 239 | Planejamento puro da sincronização agenda -> Consultas |
| `Alertas.js` | PRODUÇÃO | 59 | Grava no Registro e manda o alerta (Google) |
| `Configuracoes.js` | PRODUÇÃO | 240 | Validação pura das Configurações, por domínio |
| `DadosTeste.js` | TESTE | 179 | Dados fictícios (lógica pura) |
| `DriveAvancado.js` | PRODUÇÃO | 88 | Chamadas ao Drive v3 |
| `Esquema.js` | PRODUÇÃO | 157 | Esquema das abas e validações da planilha |
| `Execucao.js` | PRODUÇÃO | 42 | Envelope de execução dos itens de menu (erro tratado, sem exceção crua) |
| `FilaAjustes.js` | ESQUELETO | 72 | T22: fila de ajustes do plano |
| `Formatos.js` | PRODUÇÃO | 110 | Datas, dinheiro, CPF, neutralização de fórmula |
| `Frases.js` | ESQUELETO | 65 | T23: frases e links wa.me (único lugar permitido para `wa.me`) |
| `GeradorRecibo.js` | PRODUÇÃO | 185 | Recibo em PDF (Google) |
| `GeradorTeste.js` | TESTE | 158 | Gera e apaga eventos e pacientes de teste (Google) |
| `GerarAReceber.js` | PRODUÇÃO | 45 | Gera os valores a receber (Google) |
| `GerarRelatorio.js` | PRODUÇÃO | 51 | Relatório mensal (Google) |
| `Instalador.js` | PRODUÇÃO | 89 | Instalação idempotente da planilha |
| `LeitorAbas.js` | PRODUÇÃO | 106 | Leitura e escrita de abas (confere cabeçalho e identidade da linha) |
| `LeitorConfiguracoes.js` | PRODUÇÃO | 30 | Leitura da aba Configurações |
| `Menu.js` | PRODUÇÃO | 178 | Menu e ações em linhas selecionadas |
| `Modos.js` | ESQUELETO | 39 | T24: modos de acompanhamento |
| `Pagamentos.js` | PRODUÇÃO | 135 | Planejamento puro dos valores a receber |
| `Pix.js` | PRODUÇÃO | 108 | Pix copia e cola |
| `Precos.js` | PRODUÇÃO | 51 | Preços em reais -> centavos (Google) |
| `Presenca.js` | ESQUELETO | 72 | T21: painel de presença |
| `Principal.js` | PRODUÇÃO | 9 | Versão do kit (`VERSAO_KIT`, mostrada no Registro) |
| `Recibo.js` | PRODUÇÃO | 164 | Regras puras do recibo e reconciliação por identidade |
| `Registro.js` | PRODUÇÃO | 106 | Regras puras do Registro (máscara, tipo de erro) |
| `Relatorio.js` | PRODUÇÃO | 175 | Regras puras do relatório do mês |
| `Respostas.js` | ESQUELETO | 61 | T20: pergunta semanal e aba Respostas |
| `SincronizarAgenda.js` | PRODUÇÃO | 160 | Sincronização da agenda (Google) |

Resumo: 23 de produção, 5 esqueletos, 2 de teste, 0 experimentais.

## Fora de src/

Ferramentas de desenvolvimento, nunca enviadas ao Google: `scripts/empacotar-producao.js`, `scripts/cobertura.js`, `scripts/mutacoes.js`, `scripts/seguranca.js`, `scripts/complexidade.js`, `scripts/desempenho.js`, `scripts/revisao.js` (ciclo de revisão com o ChatGPT) e, na etapa E, `scripts/gate.js`. O protótipo da ponte oficial (`prototipo/`, D35/D44) pertence à outra linha de trabalho (PR #15) e não faz parte desta branch; quando entrar na `main`, deve ganhar classificação própria aqui (EXPERIMENTAL ou ESQUELETO) e ficar fora de `src/`, como a regra 2 do `CLAUDE.md` já exige.

## Outras partes incompletas conhecidas

- As pendências P1 a P11 da fase 2b (`docs/PENDENCIAS-FASE-2B.md`) continuam abertas e são do Caio e da nutricionista. O teste acima garante que só esqueleto carrega `PENDENTE Pn` e que cada marca tem linha na lista.
- Não há `TODO`, `FIXME`, `XXX` nem `HACK` em `src/` ou `scripts/` (busca textual feita em 01/10/2026).
