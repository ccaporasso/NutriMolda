# MVP: interface própria sobre a base Google

Direção D33, atualizada por D34–D44 em 30/09/2026. **Planejamento; interface ainda não implementada.**

## Experiência esperada

A nutricionista opera telas e botões intuitivos, sem editar células ou usar menus da planilha no cotidiano. O paciente agenda pelo WhatsApp oficial. Planilhas, Apps Script, Agenda e Drive ficam por trás.

| Camada | Papel |
|---|---|
| Interface da profissional | Liberar/revogar pacientes; listar consultas e detalhes; encaminhar e retomar atendimento |
| Núcleo comum | Autorização, estados, regras e comandos por IDs estáveis |
| Adaptadores | Traduzir os comandos para serviços reais; no B1, apenas simulação local |
| Base Google | Pacientes, consultas, cobranças e documentos já previstos |
| Ponte oficial | Receber eventos autenticados, tratar persistência e encaminhar respostas autorizadas |

O acesso da profissional é restrito. Identidade, autorização e contexto de consultório vêm do servidor. O navegador não recebe tokens, configurações completas ou dados de outros consultórios. Não publicar a interface com acesso anônimo.

A API entre ponte e Apps Script é uma proposta separada em WHATSAPP-PONTE-COFRE.md; sua eventual exposição não torna a interface da profissional pública. A escolha de execução como proprietária ou usuária e o acesso à planilha fora do menu continuam pendentes de prova em UI00.

## Próxima entrega local (B1.3 / UI01L)

1. Listar pacientes fictícios e permitir liberação/revogação com validade.
2. Simular a escolha e confirmação de um horário pelo paciente.
3. Mostrar a consulta e seus detalhes, usando os mesmos dados e núcleo.
4. Encaminhar ao humano e retomar pela profissional autorizada.
5. Mostrar estados vazio, carregando, erro e conflito, com operação por teclado.

A tela deve indicar que é uma demonstração com dados fictícios. Não exibir detalhes de infraestrutura no fluxo de produto. Toda ação usa identidade e IDs estáveis; a UI não altera diretamente o repositório de dados para contornar o núcleo.

Aceite local: jornada executável e testes de autorização, repetição, conflito, falha e retomada. Isso não comprova login, persistência ou isolamento reais. Contrato completo em CLAUDE-BLOCO-1.md.

## Conexão posterior (UI00–UI03)

| Tarefa | Entrega |
|---|---|
| UI00 | Provar identidade da profissional, autorização por consultório e leitura da planilha correta fora do menu |
| UI01 | Conectar consultas/detalhes e liberação ao adaptador Google, com acesso restrito e dados fictícios da cópia de teste |
| UI02 | Adicionar Pix da cobrança a receber usando regras existentes; recusar pagamento já pago, copiar código e não marcar pago |
| UI03 | Validar percurso real só pela interface, sem abrir planilha ou menus, com origem e permissões conferidas |

A primeira jornada integrada com WhatsApp deve mostrar a consulta criada pela WA05 na interface. Pix fica como incremento complementar, aproveitando o financeiro validado.

## Adaptação necessária

O código atual depende de getActiveSpreadsheet, getUi e seleção de linhas. A interface precisa de comandos com identidade conferida no servidor; não basta chamar funções do menu.

Preservar cabeçalhos, integridade, origem da agenda, travas e idempotência. Avaliar acesso à planilha e documentar permissões antes de qualquer ampliação. O B1 não modifica manifesto ou produção.

Após validar a primeira jornada, expandir remarcação, cancelamento, acompanhamento, sinais de atenção e os complementos financeiros. Editor alimentar e portal do paciente continuam posteriores. As decisões da fase 2b permanecem em PENDENCIAS-FASE-2B.md.

Resultados atuais: [RESULTADOS-GOOGLE-2026-09-30.md](RESULTADOS-GOOGLE-2026-09-30.md). Próximas tarefas: [TAREFAS.md](TAREFAS.md).
