# MVP: interface própria sobre a base Google

Direção confirmada por Caio em 30/09/2026, decisão D33. Planejamento, sem interface implementada.

## Experiência esperada

A cliente nutricionista opera nosso aplicativo por telas e botões intuitivos. Não precisa editar células ou usar menus da planilha no trabalho cotidiano. A planilha é o armazenamento inicial; Agenda e Drive guardam eventos e documentos. Apps Script recebe as ações, valida acesso/dados e executa as regras já testadas.

| Camada | Papel |
|---|---|
| Interface própria | Consultas, detalhes e ações; estados de carregamento, vazio, sucesso e erro |
| Apps Script | Permissões, validação, IDs estáveis, regras e acesso aos serviços Google |
| Planilhas | Pacientes, consultas, cobranças, pacotes, configurações e registros |
| Agenda / Docs / Drive | Eventos, modelo e arquivos gerados |

O acesso deve ser restrito. Não aprovar acesso anônimo nem retornar chaves, configurações completas ou dados de outros consultórios ao navegador. O modelo de identidade, implantação e isolamento precisa ser definido antes da conexão; a escolha de executar como proprietário ou usuário muda as permissões e não está decidida.

## Primeira entrega (UI00–UI03)

1. Provar identidade, autorização e leitura da planilha correta fora do menu.
2. Listar consultas e abrir detalhes por ID estável.
3. Encontrar a cobrança da consulta e gerar Pix se a_receber usando as regras existentes.
4. Exibir/copiar o código sem marcar o pagamento pago, com erros compreensíveis.

Critério de aceite: fluxo completo na cópia descartável com dados fictícios, usando só nossa interface. Verificar ausência de acesso indevido, pagamento já pago recusado, valor/recebedor corretos e preservação dos registros.

## Adaptação necessária

O código atual usa getActiveSpreadsheet, getUi e seleção de linhas no contexto do menu. A interface web precisa de comandos próprios com parâmetros validados e identidade conferida no servidor; não basta chamar as funções do menu. Conferir se o acesso à planilha vinculada funciona no contexto escolhido e documentar qualquer escopo necessário antes de ampliá-lo. Manter trava, origem da agenda, cabeçalhos, integridade e idempotência.

Nenhum novo servidor, banco externo, dependência, escopo ou publicação foi feito para este planejamento. A base Google pode servir ao MVP; decisão futura de migração depende de requisitos e uso medidos, sem prometer capacidade ilimitada.

## Etapas posteriores

Após validar a primeira entrega, expandir cadastro de pacientes, atualização de consultas, pagamentos e recibos. O editor alimentar e o portal do paciente dos documentos conceituais são outros recortes, ainda não implementados. As decisões pendentes da fase 2b continuam em docs/PENDENCIAS-FASE-2B.md.

Resultados atuais: [RESULTADOS-GOOGLE-2026-09-30.md](RESULTADOS-GOOGLE-2026-09-30.md). Próximas tarefas: [TAREFAS.md](TAREFAS.md).
