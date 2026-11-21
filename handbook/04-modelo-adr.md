---
title: Handbook do laboratório, modelo de ADR
type: documento
status: draft
dono: '@phalves-lab/platform'
revisado_em: 2026-11-21
---

# Modelo de ADR

Registro de decisão de arquitetura (ADR) do laboratório. Cada decisão vira um arquivo, numerado em sequência (`ADR-001`, `ADR-002`), revisado em PR como qualquer mudança. O modo ADR do chat do portal gera um rascunho neste formato a partir de uma conversa; quem decide revisa, completa e versiona.

## Seções do ADR

1. **Título**: `ADR-NNN · a decisão em uma frase`.
2. **Status**: Proposto, Aceito, Rejeitado ou Substituído por ADR-NNN.
3. **Data**: dia em que a decisão foi tomada.
4. **Contexto**: o problema, as restrições e o que obriga a decidir agora.
5. **Opções consideradas**: cada opção com prós e contras.
6. **Decisão**: a opção escolhida e o motivo.
7. **Consequências**: o que melhora, o que piora e o que passa a ser exigido.
8. **Relacionados**: padrões do handbook (como ENG-PR-03), decisões pendentes e ADRs anteriores.
9. **Pendências**: o que ainda falta confirmar e qual papel confirma.

## Quando escrever um ADR

Escreva um ADR quando a decisão for difícil de desfazer, mudar um padrão numerado ou fechar uma decisão pendente. Decisão pequena e reversível fica no PR.
