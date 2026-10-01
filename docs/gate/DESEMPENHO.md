# Desempenho: crescimento e chamadas externas (Gate, item 36)

**Em uma frase:** a lógica local cresce de forma linear (ou quase) até 5.000 consultas e pagamentos, e cada operação faz um número fixo de chamadas à planilha, à Agenda e ao Drive, qualquer que seja o tamanho da base; a medição achou e corrigiu quatro pontos em que o trabalho crescia com o quadrado do tamanho (A-18 em `docs/gate/ACHADOS.md`).

Não há meta de milissegundos: os tempos abaixo mudam de máquina para máquina e só mostram a forma do crescimento. O que a suíte confere (`tests/desempenho.test.js`, 15 casos) são **contagens**, que não dependem da máquina: quantas vezes a lógica toca em cada dado por elemento (se cresce com n, há laço dentro de laço) e quantas chamadas cada operação faz ao Google simulado. Para reproduzir: `node scripts/desempenho.js`.

## Cenários

100 pacientes; 1.000 e 5.000 consultas; 1.000 e 5.000 pagamentos; casos de pior forma (todas as consultas "primeira" de pacientes diferentes; 5.000 pacientes; todas as linhas sem marca de agenda; muitas consultas canceladas com cobrança aberta). Dados inventados, gerados por sequência fixa (`tests/apoio/escala.js`).

## Medição depois das correções

### Lógica local (melhor de 3 execuções, em milissegundos, neste computador; só ilustra a forma do crescimento)
| Cenário | ms |
|---|---|
| sincronização: 1.000 eventos novos, 100 pacientes | 9 |
| sincronização: 5.000 eventos novos, 100 pacientes | 52 |
| sincronização: 5.000 eventos novos, 1.000 pacientes | 30 |
| a receber: 1.000 consultas "primeira", 1.000 pacientes distintos | 2 |
| a receber: 5.000 consultas "primeira", 5.000 pacientes distintos | 11 |
| a receber: 5.000 consultas, 5.000 pagamentos (reexecução) | 16 |
| relatório do mês: 1.000 pagamentos | 3 |
| relatório do mês: 5.000 pagamentos | 12 |
| pacotes: reconciliar 500 pacotes contra 5.000 pagamentos | 5 |

### Chamadas externas por operação (Google simulado; planilha conta por CHAMADA, não por linha)
| Operação | Linhas na base | Leituras da planilha | Escritas na planilha | Agenda: list | Agenda: get | Drive |
|---|---|---|---|---|---|---|
| sincronizar, base estável | 100 | 8 | 1 | 1 | 0 | 0 |
| sincronizar, base estável | 1000 | 8 | 1 | 4 | 0 | 0 |
| sincronizar, base estável | 5000 | 8 | 1 | 20 | 0 | 0 |
| sincronizar, todas as linhas sem marca de agenda | 100 | 8 | 2 | 1 | 0 | 0 |
| sincronizar, todas as linhas sem marca de agenda | 1000 | 8 | 2 | 4 | 0 | 0 |
| sincronizar, todas as linhas sem marca de agenda | 5000 | 8 | 2 | 20 | 0 | 0 |
| sincronizar, consultas novas na agenda | 100 | 7 | 2 | 1 | 0 | 0 |
| sincronizar, consultas novas na agenda | 1000 | 7 | 2 | 4 | 0 | 0 |
| sincronizar, consultas novas na agenda | 5000 | 7 | 2 | 20 | 0 | 0 |
| gerar a receber (consultas sem cobrança) | 100 | 6 | 2 | 0 | 0 | 0 |
| gerar a receber (consultas sem cobrança) | 1000 | 6 | 2 | 0 | 0 | 0 |
| gerar a receber (consultas sem cobrança) | 5000 | 6 | 2 | 0 | 0 | 0 |
| gerar a receber (reexecução) | 100 | 6 | 1 | 0 | 0 | 0 |
| gerar a receber (reexecução) | 1000 | 6 | 1 | 0 | 0 | 0 |
| gerar a receber (reexecução) | 5000 | 6 | 1 | 0 | 0 | 0 |
| gerar recibo em PDF (1 pagamento, n na base) | 100 | 10 | 2 | 0 | 0 | 4 |
| gerar recibo em PDF (1 pagamento, n na base) | 1000 | 10 | 2 | 0 | 0 | 4 |
| gerar recibo em PDF (1 pagamento, n na base) | 5000 | 10 | 2 | 0 | 0 | 4 |
| marcar 1 pagamento como pago no Pix (n na base) | 100 | 4 | 1 | 0 | 0 | 0 |
| marcar 1 pagamento como pago no Pix (n na base) | 1000 | 4 | 1 | 0 | 0 | 0 |
| marcar 1 pagamento como pago no Pix (n na base) | 5000 | 4 | 1 | 0 | 0 | 0 |
| relatório do mês (n pagamentos) | 100 | 4 | 1 | 0 | 0 | 2 |
| relatório do mês (n pagamentos) | 1000 | 4 | 1 | 0 | 0 | 2 |
| relatório do mês (n pagamentos) | 5000 | 4 | 1 | 0 | 0 | 2 |

Outras operações medidas, também constantes: marcar uma linha como paga (4 leituras e 1 escrita na planilha, sem Drive; a conferência do cabeçalho e da identidade da linha entram na conta); no máximo 20 linhas por ação de menu (`MAX_LINHAS_POR_ACAO`), cada uma com no máximo 3 chamadas à planilha.

## O que mudou por causa da medição (A-18)

| Ponto | Antes | Depois |
|---|---|---|
| A receber: "há consulta anterior?" para cada "primeira" (cada consulta de um paciente diferente) | 2.022 leituras por consulta com 1.000 e 10.031 com 5.000 (n²) | 29 e 38 (n log n, só da ordenação) |
| Identificar paciente por evento (5.000 eventos x 5.000 pacientes) | 4.108 ms | 56 ms |
| Reconciliar pacotes (pacotes x pagamentos) | 11,6 e 51,6 leituras por pacote | 1, plano |
| Sincronização, 5.000 linhas sem marca de agenda | 5.001 escritas na planilha | 2 |
| Sincronização, 300 linhas vizinhas remarcadas | 301 escritas | 1 |

## Residuais e limites (explícitos)

- **Linhas isoladas continuam com uma escrita cada.** Remarcar 500 consultas não vizinhas faz 500 escritas. Juntar tudo reescreveria células entre elas, que a nutricionista pode estar editando. Na prática o gatilho de hora em hora vê poucas mudanças por vez.
- **A Agenda devolve no máximo 250 eventos por página:** 5.000 eventos = 20 chamadas `Calendar.Events.list`. A janela de leitura é de 150 dias, então 5.000 eventos na janela já seria uma agenda de cerca de 33 consultas por dia.
- **Conferência de ausentes:** no máximo 40 chamadas `Calendar.Events.get` por execução (`MAX_CONFERENCIAS_AGENDA`).
- **Recibo:** 4 chamadas ao Drive por recibo (listar, copiar, criar o PDF, lixeira), mais as chamadas de edição do Docs; constante.
- **Leitura da aba inteira:** cada operação lê a aba por inteiro uma vez (`lerAbaComoObjetos`). Com 5.000 linhas é uma leitura grande, mas única; o tempo real dessa chamada no Google é **N/M**.

## N/M (precisa do Google real)

Tempo real de leitura e escrita da planilha, de `Calendar.Events.list` e de cada chamada do Drive e do Docs; cota diária de tempo de gatilho; comportamento com 5.000 linhas na aba Consultas. Roteiro em `docs/gate/GOOGLE-REAL.md`.
