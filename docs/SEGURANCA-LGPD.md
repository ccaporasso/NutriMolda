# Segurança e LGPD — lista de verificação

## Sempre

- [ ] Só dados inventados no desenvolvimento e nos testes.
- [ ] Nenhum nome de paciente ou dado de saúde em registros, alertas, nomes de arquivo ou commits.
- [ ] Nenhuma chave, senha ou identificador real no repositório.
- [ ] Permissões mínimas, justificadas em `DECISOES.md`.
- [ ] Planilha compartilhada só com quem precisa. Nunca "qualquer pessoa com o link".
- [ ] Verificação em dois fatores na conta Google de teste e na da cliente.

## Onde o kit guarda nome e CPF

- Recibo em PDF e CSV do relatório trazem nome e CPF de quem pagou (necessário para o recibo e para o carnê-leão). Ficam só na pasta do Drive da nutricionista.
- [ ] Pasta de recibos compartilhada só com quem precisa (nunca "qualquer pessoa com o link").
- [ ] Nome dos arquivos só com número do recibo, código do paciente ou mês (o teste automático de recibo e de relatório confere).
- [ ] Registro e e-mails de alerta sem nome, CPF, e-mail nem texto de erro (fixo: módulo e tipo).
- O rascunho de trabalho do recibo (`rascunho-Recibo-...`) tem nome e CPF e vai para a lixeira do Drive dela, onde o Google o guarda por 30 dias. Se ele não for para a lixeira, o kit avisa na tela e no Registro: apague à mão.

## Ponte do WhatsApp e porta do cofre (D35, D36, D43)

Testes feitos pelo programador de confiança do Caio, que não escreve o código, com relatório escrito (tarefa WA08):

- [ ] Evento sem assinatura, ou com assinatura errada, é recusado.
- [ ] O mesmo evento recebido duas vezes não marca duas consultas.
- [ ] Paciente A não lê nem altera consulta de B; contexto de outra clínica é recusado, mesmo com paciente/token válidos.
- [ ] Confirmações concorrentes do mesmo horário geram uma reserva e um conflito; a integração considera alterações diretas na agenda.
- [ ] Queda após confirmação técnica não perde o trabalho; queda após gravação na agenda não cria segunda consulta na retomada.
- [ ] Número fora da lista de liberados não recebe menu.
- [ ] Liberação expirada/revogada impede operação e envio pendentes; PARAR revoga e MENU não reativa.
- [ ] Atendimento humano pausa a automação até retomada da profissional autorizada.
- [ ] Chamada à API da base sem autenticação válida é recusada antes de consultar dados de pacientes; o token não substitui autorização por registro.
- [ ] Texto que começa com `=` não vira fórmula na planilha.
- [ ] Os tokens da Meta e do cofre não aparecem em log, planilha nem repositório.
- [ ] O registro da ponte não guarda nome nem texto do paciente.
- [ ] Há limite de mensagens por número por hora.
- [ ] Identidade inicial do canal é verificada sem aproximação de telefone; identificadores fornecidos pelo cliente não definem acesso.
- [ ] Inventário de estado, fila, eventos processados e saídas define localização, acesso, retenção e descarte. Códigos associados a pacientes não são considerados anônimos.
- [ ] Resultado incerto de gravação é reconciliado antes de repetir; eventos antigos e comandos com a mesma chave e conteúdo diferente são recusados.
- [ ] Segurança dos adaptadores reais e da implantação foi revisada. Testes simulados de B1 não substituem essa evidência.

## Antes do primeiro dado real

- [ ] Resposta do RH, por escrito, sobre a atividade paralela.
- [ ] Testes de segurança da ponte e da porta do cofre concluídos e achados altos corrigidos (WA08).
- [ ] Decisão do Caio sobre D2 × D43: o teste do programador atende à revisão profissional?
- [ ] Papéis e contratos de tratamento de dados definidos para hospedagem e Meta; termos aplicáveis aceitos pela nutricionista.
- [ ] Aviso ao paciente descreve os serviços e fluxos efetivos de dados, inclusive eventual transferência internacional, com revisão jurídica.
- [ ] Contrato com sigilo, papel de operador de dados, prazo de suporte e obrigação de apagar dados ao final.
- [ ] Aviso de privacidade e textos de consentimento revisados por advogado.
- [ ] Aviso de uso de ferramentas automatizadas e de que não é canal de urgência.
- [ ] Revisão de segurança feita por uma pessoa desenvolvedora.
- [ ] Taxa de faltas e de retornos da nutricionista nos meses anteriores anotada, para comparar depois.

## Papéis

- **A nutricionista** é a controladora dos dados e a responsável clínica.
- **Você** é operador quando acessa dados para dar suporte. Fora disso, não acessa.
- **A ponte** trata mensagens e metadados operacionais conforme inventário definido antes da implantação. Seu operador e a hospedagem terão papéis e obrigações estabelecidos nos contratos; não presumir ausência de armazenamento ou de tratamento por usar dados codificados.
