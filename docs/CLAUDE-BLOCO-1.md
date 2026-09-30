# B1 — núcleo testável e interface local do primeiro agendamento

Atualizado em 30/09/2026, D44. **Especificação do trabalho; implementação a fazer.**

## Entrega esperada

Uma demonstração local funcional, com dados fictícios, em que a nutricionista libera um paciente, ele escolhe e confirma um horário pelo simulador de conversa e a consulta aparece na interface. Encaminhar para a nutricionista pausa as respostas automáticas. O mesmo núcleo deve ser usado pelo simulador, pelos testes e pela interface.

Este bloco aproveita trabalho de programação que independe de conta Meta, token, hospedagem, decisão de preço ou implantação Google. Não estimar quantas funcionalidades cabem em “30% de crédito”: a unidade de avanço é o incremento concluído e testado.

## Escopo e organização

- JavaScript, sem novas dependências; testes com node:test.
- Código experimental em prototipo/whatsapp/; interface e dados fictícios em prototipo/interface/. Manter tudo fora de src/ e do pacote de produção.
- Colocar novos testes no padrão existente tests/*.test.js, para a execução padrão encontrá-los.
- Interface com HTML/CSS/JavaScript simples, sem CDN, telemetria ou fontes externas. Identificar visivelmente a demonstração como dados fictícios.
- Reaproveitar funções puras existentes quando adequadas. Não chamar funções que dependem da seleção de linha, getUi ou contexto do menu.
- Não alterar manifesto, instalador, cabeçalhos, produção, financeiro, T20–T24 ou os testes que protegem essas partes.
- Não implementar o editor alimentar, portal do paciente, IA, previsão de abandono, envio real, cobrança, remarcação/cancelamento completos ou check-ins neste bloco.
- Não fazer login, solicitar credenciais, contratar serviço, publicar endpoint ou executar clasp push para concluir B1.

## Contrato inicial do domínio

O núcleo recebe eventos já normalizados pelo adaptador; ele não interpreta aqui o webhook bruto da Meta. O adaptador de teste cria um contexto verificado fictício. Isso não implementa autenticação de produção.

| Elemento | Contrato |
|---|---|
| Contexto | Identidade do consultório e papel profissional/paciente resolvidos pelo adaptador confiável; contexto ausente ou incompatível é recusado |
| Identidade do paciente | Vínculo exato entre identificador do canal e código do paciente no consultório; nunca inferir por nome ou retirada automática do nono dígito |
| Liberação | Autorizada por profissional do mesmo consultório; data, validade, revogação e versão explícitas; validade ausente/inválida é recusada |
| Evento | Identificador estável, tipo permitido, instante recebido pelo servidor e parâmetros limitados; relógio injetado para testes |
| Comando | Chave de idempotência vinculada ao consultório, evento, identidade, ação e parâmetros; chave reutilizada com conteúdo diferente é recusada |
| Consulta | ID estável, paciente, consultório, origem da agenda, início, fim e status; detalhes só retornam a identidades autorizadas |
| Saída | Novo estado e resultado/intenção de ação; nenhuma chamada externa feita por uma função pura |
| Erro | Código e mensagem neutra, sem texto externo, segredo ou dados de outro paciente |

Os nomes internos podem ser ajustados pelo Claude, mantendo essas garantias e documentando o contrato final no PR. Exemplos só com dados sintéticos; a configuração de teste nunca representa regras clínicas ou operacionais aprovadas para uma cliente.

### Estados mínimos

- sem_liberacao: nenhuma operação automática nem mensagem de saída.
- menu: paciente autorizado pode pedir horários, falar com a nutricionista ou parar.
- escolhendo_horario: opções disponíveis identificadas por ID; escolher não reserva.
- aguardando_confirmacao: confirmação exige opção atual, versão válida e autorização ainda ativa.
- consulta_confirmada: repetir o mesmo comando devolve a reserva existente, sem criar outra.
- atendimento_humano: automação pausada; só a profissional autorizada pode retomar.
- revogado: PARAR ou revogação pela profissional; MENU não reativa.

A expiração da liberação prevalece sobre qualquer estado. MENU reinicia apenas uma conversa ativa e autorizada. Comando fora da etapa ou resposta antiga de botão/lista deve produzir resultado neutro, sem gravação. A confirmação nunca usa somente a posição da opção ou da linha.

### Adaptadores simulados

Interfaces explícitas para cadastro/liberação, consultas/disponibilidade, estado de conversa, operações processadas e saída de mensagens. Repositórios separados por consultório, relógio controlável e falhas injetáveis.

O contrato de reserva deve permitir verificar disponibilidade e reservar de forma atômica. O simulador precisa sustentar teste de concorrência real entre duas solicitações; não simular “concorrência” apenas com duas chamadas sequenciais.

Recriar o processador mantendo o repositório simulado serve para testar retomada de uma operação. Não prova persistência após perda do processo ou servidor. A implementação durável e a fila real continuam em WA02/WA03/WA09.

Após resultado externo incerto, consultar/reconciliar a operação antes de repetir o efeito. Revalidar autorização antes de nova tentativa e antes de enviar uma resposta pendente. Revogação não desfaz silenciosamente uma consulta já gravada: deixa o estado consistente e bloqueia novos efeitos automáticos.

## Incrementos em ordem

| Incremento | Implementação | Aceite |
|---|---|---|
| B1.1 | Contratos, autorização e máquina de estados; liberação/revogação/pausa; dados e relógio de teste | Sem rede; recusa de contexto ausente, paciente errado e consultório errado; estados e eventos antigos cobertos |
| B1.2 | Disponibilidade, confirmação, idempotência, conflito e recuperação com adaptadores simulados | Uma reserva por operação/horário; resultado incerto tratado; falhas não viram confirmação falsa; jornada completa por teste de integração |
| B1.3 | Interface local da profissional e simulador de conversa usando o mesmo núcleo | Liberar/revogar, listar consultas, abrir detalhes e encaminhar/retomar atendimento humano; estados vazio, carregando, erro e conflito; uso por teclado e mensagens claras |

Faça commits pequenos, cada incremento com seus testes. Termine o incremento atual antes de abrir o próximo; preserve checkpoint se houver interrupção. Não usar agentes adicionais ou abrir tarefas paralelas sem solicitação expressa.

## Casos de aceitação obrigatórios

1. Paciente autorizado agenda; a mesma consulta aparece na lista e nos detalhes da profissional.
2. Sem liberação, liberação expirada, revogada ou de outro consultório: nenhum efeito nem saída automática.
3. Paciente A tenta consultar/alterar consulta de B; profissional de outra clínica tenta liberar/ler: recusa antes do acesso ao registro protegido.
4. Mesmo evento e mesma confirmação repetidos: um único agendamento; mesma chave com parâmetros diferentes: recusa.
5. Duas confirmações concorrentes no mesmo horário: uma reserva, um conflito; opção indisponível deixa de ser confirmável.
6. Falha antes de gravar: nenhuma consulta confirmada; repetir após recuperar pode concluir uma vez.
7. Falha depois de reservar e antes de registrar/enviar a resposta: reconciliação encontra a consulta; não cria uma segunda.
8. Horário/data inválidos ou passados, opção forjada, versão antiga e evento fora de ordem: nenhum efeito.
9. PARAR, expiração ou revogação entre seleção e confirmação: impede o agendamento; também bloqueia respostas automáticas ainda pendentes.
10. Encaminhamento humano pausa; MENU não retoma nem reativa consentimento; só profissional do mesmo consultório retoma quando a liberação está válida.
11. Saídas de registro/erro não contêm corpo de conversa, telefone, segredo ou informação clínica, mesmo com entrada malformada.
12. Nome/texto com marcação HTML aparece como texto na interface; payload não executa código. Futuro adaptador de planilha também precisa neutralizar fórmulas.
13. Testar fim de dia e virada de data em America/Sao_Paulo; duração/intervalos vêm da configuração de teste.
14. Interface usa IDs estáveis e não exige abrir planilha; reiniciar a demonstração só afeta seus dados fictícios.

Se algum caso não couber no incremento, registrar como pendente e não declarar B1 completo. Os casos de alteração alheia cobrem o mecanismo comum de autorização; não exigem implementar remarcação ou cancelamento neste bloco.

## Verificação e entrega

1. Executar os testes pertinentes a cada incremento.
2. Ao final, rodar node --test para a suíte existente e nova. Se o ambiente bloquear subprocessos, registrar o erro e executar as alternativas cabíveis, identificando nominalmente o que ficou sem executar; não transformar exclusão em “suíte completa”.
3. Rodar node scripts/empacotar-producao.js e conferir que prototipo/ não foi incluído e os escopos continuam os mesmos.
4. Abrir a interface local, quando houver navegador disponível, e percorrer a jornada e um caso de erro. Se não houver, declarar inspeção visual pendente; teste de lógica não substitui essa verificação.
5. Registrar roteiro de execução, comandos e resultados; atualizar CHANGELOG.md e TAREFAS.md sem marcar WA02/WA03/UI00 como concluídas.
6. Abrir PR contra main, com problema resolvido, comportamento, testes e limitações. Não fazer merge automático do código novo.
7. Deixar checkpoint com commit, incremento concluído, pendências e próximo comando se o ambiente/crédito interromper o trabalho.

Critério de encerramento: B1.1–B1.3 concluídos, verificações registradas e PR revisável. Integração real e revisão independente são entregas posteriores.

## Depois de B1

Revisar o código e conectar um único fluxo ao número de teste da Meta e à cópia Google descartável, após definir hospedagem, persistência, identidade e permissões. Testar reinício real, eventos repetidos, isolamento e concorrência. Só depois ampliar os menus e fazer piloto, conforme D12 e WA08.
