# WhatsApp: ponte e base Google

Direção atualizada em 30/09/2026 após auditoria (D34–D44). **Planejamento; integração não implementada.** O nome “cofre” é uma metáfora para o Apps Script, não uma certificação de segurança.

## Objetivo e primeira entrega

A nutricionista usa nossa interface. O paciente usa o WhatsApp oficial. Planilhas, Agenda e Apps Script são a infraestrutura inicial. A redução de trabalho e a melhora do acompanhamento são hipóteses a medir no piloto.

Primeira jornada: liberar um paciente → receber sua interação → oferecer horários → confirmar um horário → mostrar a consulta na interface → permitir encaminhamento humano. Remarcação, cancelamento, check-ins, disparos e painel de atenção entram depois, por incrementos. O financeiro existente permanece disponível como complemento.

## Responsabilidades e dados

| Componente | Responsabilidade | Dados e limites |
|---|---|---|
| Meta / WhatsApp oficial | Entregar mensagens e eventos; aplicar suas políticas e preços | O canal processa mensagens. A existência de menus não torna o canal um prontuário |
| Ponte | Validar assinatura da Meta sobre o corpo original, normalizar eventos, encaminhar comandos e respostas autorizadas | Trata dados em trânsito e pode necessitar de metadados operacionais mínimos. Não afirmar “não trata nem guarda dados” sem especificar fila, estado, logs e retenção |
| Apps Script | Autorizar operações, validar comandos, executar regras e acessar a base correta | O token entre serviços não substitui a autorização por paciente, consulta e consultório |
| Planilhas / Agenda / Drive | Guardar cadastro, consultas e documentos já previstos | Cada consultório tem contexto configurado no servidor; nenhuma planilha ou agenda arbitrária indicada pelo paciente |
| Interface da nutricionista | Liberar/revogar acesso e acompanhar consultas e pendências | Identidade da profissional e autorização conferidas no servidor. UI00 permanece pendente |

O estado da conversa e o controle de duplicações podem ficar no Google. Não há decisão de contratar banco externo. A escolha da persistência depende de prova de recuperação, cotas e tempo de resposta; deve constar de WA09 antes da integração.

### Inventário obrigatório antes de hospedar

Definir para cada item: finalidade, campos mínimos, local, quem acessa, prazo de retenção, descarte e restauração.

- Vínculo verificado entre identificador do WhatsApp e paciente do consultório.
- Consentimento/liberação, validade, revogação e pausa para atendimento humano.
- Estado e versão da conversa.
- Identificador do evento/comando, resultado e etapa de processamento.
- Fila de trabalho, tentativas e mensagens de saída pendentes.
- Registros técnicos sem corpo de mensagem, telefone, segredo ou informação clínica.

Identificadores associados a uma pessoa não são tratados como anônimos só por serem códigos. O tempo de retenção da deduplicação deve considerar a janela de reenvio efetivamente documentada pelo provedor; a expiração não pode permitir recriar uma consulta já confirmada.

## Recebimento e recuperação

Para o desenho assíncrono proposto:

1. Validar origem e assinatura antes de confiar no conteúdo.
2. Validar o formato mínimo e vincular o canal ao consultório configurado no servidor.
3. Registrar o trabalho aceito em armazenamento persistente, com chave de idempotência.
4. Só então confirmar o recebimento ao provedor.
5. Processar o comando; conferir novamente autorização, validade e pausa antes de cada efeito.
6. Registrar resultado e intenção de resposta para recuperação de falhas.

Uma fila gerenciada é uma possibilidade; um mecanismo durável na base Google é outra hipótese a validar. Não basta responder “ok” e deixar uma tarefa apenas na memória. Se a persistência falhar, o evento não deve ser reconhecido como aceito. Eventos inválidos e tipos ignorados têm tratamento próprio no adaptador, conforme contrato da Meta.

Separar recebimento, processamento e envio. Se a gravação na agenda tiver resultado incerto, reconciliar pela identidade estável da operação antes de repetir. Não prometer entrega exatamente uma vez: exigir que reenvios não repitam efeitos de negócio. Uma confirmação de recebimento técnico não significa “consulta marcada”.

## Identidade e autorização

- A assinatura confirma a origem do evento; o token da ponte autentica um serviço. Nenhum dos dois autoriza sozinho uma alteração em qualquer consulta.
- O servidor resolve paciente e consultório a partir do vínculo verificado e de sua configuração. Não aceitar código de paciente, agenda, consultório ou permissão fornecidos pelo cliente como prova de identidade.
- Número fora da lista, liberação vencida ou revogada: nenhum menu nem operação automática. PARAR revoga os envios automáticos; MENU não reativa uma revogação.
- Conferir paciente, consultório e origem da agenda em cada leitura e alteração de consulta. Paciente A não pode ler, remarcar ou cancelar consulta de B, mesmo se ambos estiverem liberados.
- Tratar divergência do nono dígito sem associação automática aproximada. Vínculo inicial e mudanças de número exigem mecanismo de verificação definido em WA04; coincidência de nome ou telefone parecido não basta.
- Encaminhamento humano pausa o fluxo automático até retomada explícita da nutricionista. MENU não rompe essa pausa.
- Revogação e pausa também invalidam trabalhos de saída ainda pendentes. Conferir a autorização imediatamente antes do envio.
- Segredos fora do Git, planilha, navegador e logs; prever rotação e identificação da credencial. Token ausente/inválido: recusar antes de consultar dados de pacientes.
- Limites de tamanho, frequência e comandos; respostas de erro neutras e nenhum texto externo convertido em fórmula.

A API pública do Apps Script executando como proprietária é uma **proposta a validar**, não uma publicação autorizada por este documento. Ela executaria com os poderes dessa conta. UI00/WA03 precisam demonstrar autenticação, autorização, contexto de planilha, isolamento e permissões antes da implantação.

## Agendamento e concorrência

Consultar disponibilidade não reserva horário. Na confirmação, conferir novamente as regras configuradas e executar uma reserva atômica no mecanismo escolhido. Duas confirmações concorrentes do mesmo horário só podem produzir uma reserva.

O contrato exige: chave estável por operação, verificação de propriedade, conflito explícito, estado pendente para resultado incerto e reconciliação sem duplicar. A implementação real deve considerar também alterações feitas diretamente no Google Agenda; uma trava local sozinha não cobre todos os escritores.

Duração, intervalos, antecedência e horários de atendimento são configurações da profissional. Exemplos do simulador não viram regras de produção.

## Produto e personalização

- Painel inicial: **Pacientes que precisam de atenção**, com motivo factual e data, como “sem resposta desde X” ou “sem retorno marcado”. Não apresentar probabilidade, diagnóstico ou previsão validada de abandono.
- Mesma base de código, com textos, horários, limites e identidade visual configuráveis. Personalização adicional precisa manter testes e contrato comuns.
- Menus determinísticos, sem IA; conteúdo clínico depende da profissional.
- A interface não mostra tokens, filas, IDs de planilha ou detalhes de infraestrutura no uso cotidiano.

## Meta, hospedagem e custos: pendências explícitas

Antes de WA00/WA02/WA06/WA10, verificar na documentação oficial e na conta de teste: versão da API, formato/assinatura dos eventos, reenvios, tipos de mensagens, janela de atendimento, modelos, limites de botões/listas, identificação do remetente e requisitos de coexistência.

O patch de origem afirmava “toda mensagem custa cerca de US$ 0,0068 a partir de 01/10/2026”. **Essa afirmação não foi validada e não é premissa do orçamento.** A página geral acessível distingue mercado, categoria e entrega; não comprova sozinha a alteração anunciada para outubro. A documentação específica não ficou acessível na auditoria.

Registrar tabela vigente com data, moeda, categoria, franquias/exceções e eventual tarifa do parceiro. Somar hospedagem, fila, armazenamento, tráfego e suporte. Cota gratuita de requisições não significa custo total zero. Não há orçamento fechado nem capacidade garantida por esta documentação.

## Evidência e próximos passos

- Existente: cenários da base Google em RESULTADOS-GOOGLE-2026-09-30.md; produção atual só lê a agenda.
- B1: núcleo e interface locais com adaptadores simulados; não usa a Meta nem prova persistência/segurança reais.
- WA01: contrato inicial do primeiro percurso definido em CLAUDE-BLOCO-1.md; detalhes de transporte e fluxos posteriores pendentes.
- WA02/WA03/WA09: integração real, persistência, recuperação e hospedagem, após escolhas e testes apropriados.
- WA08: revisão independente sobre a implementação e sua implantação antes de dados reais. Os testes locais do Claude não a substituem.
- D12 e as pendências do piloto continuam válidas.

## Fontes e alcance da auditoria (30/09/2026)

- [Google — web apps e identidade de execução](https://developers.google.com/apps-script/guides/web): o objeto documentado de doPost não expõe cabeçalhos; execução como proprietária usa sua autoridade.
- [Google — Content Service](https://developers.google.com/apps-script/guides/content): esse serviço redireciona a resposta. Não generalizar isso para toda resposta possível do Apps Script; comportamento da Meta precisa de teste.
- [Google — webhooks, processamento assíncrono e tentativas](https://docs.cloud.google.com/run/docs/triggering/webhooks).
- [OWASP — autorização por objeto](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/).
- [WhatsApp — preços gerais](https://whatsappbusiness.com/products/platform-pricing/): diferencia mercado, categoria e entrega; não confirma as regras futuras específicas.
- [Meta — preços de mensagens sem modelo](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages): referência do patch; conteúdo específico não acessível na auditoria.
- [Meta — endpoint de webhook](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint/): conferir contrato vigente na integração; leitura integral pendente.
