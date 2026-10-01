# Complexidade: tamanho das funções e mistura de responsabilidades (Gate, item 34)

Medido por `node scripts/complexidade.js` (heurística por texto, sem dependências; reconhece interface, chamada ao Google, leitura/escrita de planilha, regra e Registro dentro do corpo de cada função de nível de cima de `src/`). **Não há limite de linhas imposto**: o tamanho só importa quando a mistura de responsabilidades esconde falhas dos testes. A medição é um guia para leitura, não uma nota.

## Medição (01/10/2026, sobre `src/` com os 5 esqueletos e os 2 arquivos de teste incluídos)

Funções de nível de cima em src/: 225 (média 10.6 linhas). Até 10 linhas: 159; 11 a 25: 48; 26 a 50: 12; acima de 50: 6.

### 15 maiores funções
| Arquivo | Função | Linhas | Responsabilidades (por texto) |
|---|---|---|---|
| `Agenda.js` | `planejarSincronizacaoAgenda` | 128 | só lógica |
| `Pagamentos.js` | `planejarAReceber` | 80 | só lógica |
| `GeradorRecibo.js` | `gerarRecibo` | 64 | google, planilha, regra, registro |
| `GeradorTeste.js` | `criarDadosDeTesteNaAgenda_` | 59 | interface, google, planilha, regra |
| `SincronizarAgenda.js` | `sincronizarAgenda` | 58 | google, planilha, regra, registro |
| `Relatorio.js` | `consolidarRecebimentos` | 57 | só lógica |
| `Pix.js` | `gerarPixCopiaECola` | 48 | regra |
| `Recibo.js` | `montarDadosRecibo` | 48 | só lógica |
| `Configuracoes.js` | `validarConfiguracoes` | 42 | regra |
| `GeradorRecibo.js` | `criarModeloEPastaDeRecibos` | 36 | interface, google, planilha, regra |
| `GeradorTeste.js` | `apagarDadosDeTesteDaAgenda_` | 36 | interface, google, planilha, regra |
| `Configuracoes.js` | `validarTexto_` | 34 | só lógica |
| `Esquema.js` | `planejarInstalacao` | 34 | só lógica |
| `Instalador.js` | `instalarPlanilha_` | 33 | interface, google, planilha, regra |
| `Presenca.js` | `calcularPresenca` | 31 | só lógica |

### Candidatas a separar (>= 25 linhas, toca Google/planilha/interface e mistura 4 ou mais responsabilidades): 8
| Arquivo | Função | Linhas | Responsabilidades (por texto) |
|---|---|---|---|
| `GeradorRecibo.js` | `gerarRecibo` | 64 | google, planilha, regra, registro |
| `GeradorTeste.js` | `criarDadosDeTesteNaAgenda_` | 59 | interface, google, planilha, regra |
| `SincronizarAgenda.js` | `sincronizarAgenda` | 58 | google, planilha, regra, registro |
| `GeradorRecibo.js` | `criarModeloEPastaDeRecibos` | 36 | interface, google, planilha, regra |
| `GeradorTeste.js` | `apagarDadosDeTesteDaAgenda_` | 36 | interface, google, planilha, regra |
| `Instalador.js` | `instalarPlanilha_` | 33 | interface, google, planilha, regra |
| `Menu.js` | `marcarConsultaDePacote` | 29 | interface, planilha, regra, registro |
| `GerarRelatorio.js` | `gerarRelatorioMensalComTrava_` | 26 | google, planilha, regra, registro |

## Leitura das candidatas

Critério usado para decidir se separar: **a mistura impede testar uma falha específica?** Para cada candidata, o que está medido hoje (`node scripts/cobertura.js`: todas com 100% de linhas, ramos e funções) e quais testes forçam falhas dentro dela.

| Função | A mistura atrapalha o teste de falhas? | Decisão |
|---|---|---|
| `gerarRecibo` | Não. A regra de identidade já é pura (`escolherReciboExistente`, `propriedadesDoRecibo` em `Recibo.js`). O resto é a ordem das chamadas ao Google, que é exatamente o que `tests/recibo-idempotencia.test.js` ataca com falha injetada em cada passo (copiar, abrir, trocar campos, salvar, exportar, criar o PDF, gravar o link, lixeira) | Manter. Separar a ordem das chamadas em uma "máquina de passos" esconderia o que o teste precisa ver |
| `sincronizarAgenda` | Não. O planejamento (128 linhas) é puro (`planejarSincronizacaoAgenda`, testado em `agenda.test.js` e `agenda-adversa.test.js`). O trecho que confere a identidade da linha antes de gravar é testado com linha movida no meio da execução e contado em `mudaram` (`tests/regressoes-opus.test.js`; mutação M18 remove a conferência e é detectada) | Manter. Se esse trecho crescer, extrair `planejarEscritasConferidas(plano, existentes, idsNaFolha)` como função pura |
| `criarModeloEPastaDeRecibos` | Não. Falha em cada passo (criar modelo, criar pasta, gravar id) e concorrência estão em `tests/modelo-pasta-idempotencia.test.js` (falha em cada passo e concorrência simulada) | Manter |
| `instalarPlanilha_` | Não. O plano é puro (`planejarInstalacao` em `Esquema.js`); a execução é testada em `tests/instalador.test.js` e `operacoes-idempotentes.test.js` (rodar duas vezes) | Manter |
| `marcarConsultaDePacote` (Menu) | Não. A decisão é de `Acoes.js` (pura, `aplicarPacote`); o menu só lê a seleção, trava e mostra o resultado | Manter |
| `gerarRelatorioMensalComTrava_` | Não. Consolidação e CSV são puros (`Relatorio.js`, testados com invariantes e fuzz em `relatorio-integridade.test.js`) | Manter |
| `criarDadosDeTesteNaAgenda_`, `apagarDadosDeTesteDaAgenda_` | Mistura interface, Google e regra, mas **só existem no pacote de teste** (`GeradorTeste.js`, classe TESTE, fora da produção) | Não mexer: aumentar a superfície testada de código que não vai para a nutricionista não compensa |

## Maiores funções que são só lógica

`planejarSincronizacaoAgenda` (128 linhas), `planejarAReceber` (80), `consolidarRecebimentos` (57), `montarDadosRecibo` (48), `gerarPixCopiaECola` (48). São funções puras com cobertura de 100% de linhas e ramos e testes adversos (id repetido, fuso, evento contraditório, valores extremos, fuzz com semente fixa). São longas, mas cada uma lê uma entrada e devolve um plano, sem efeito colateral: o custo de ler é maior que o risco. **Não refatoradas** (regra do roteiro: não refatorar o que está claro e testado).

## Conclusão

Nenhuma extração foi necessária neste ciclo: as funções que misturam responsabilidades já têm a regra extraída em funções puras e têm falhas injetadas em cada ponto (ver `docs/gate/MATRIZ-INTEGRIDADE.md`). A medição fica no repositório para o próximo ciclo notar se alguma função passa de "mistura testada" para "mistura que esconde falha": rodar `node scripts/complexidade.js` e comparar a lista de candidatas (o teste `tests/inventario-codigo.test.js` falha se aparecer uma candidata nova sem análise neste documento).
