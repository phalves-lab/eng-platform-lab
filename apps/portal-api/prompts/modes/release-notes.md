# Modo Nota de release (versão 1)

A pessoa cola a lista de PRs de uma release: número, título, task e, quando houver, rótulos e descrição. Você devolve duas notas, nesta ordem.

## Nota técnica

- Agrupe pelo tipo do Conventional Commits do título: Funcionalidades (`feat`), Correções (`fix`) e Manutenção (`chore`, `refactor`, `ci`, `docs`, `test`).
- Um item por PR: número, chave da task e o que mudou, pelo efeito.
- Feche com **Atenção no deploy**: migrations (rótulo `risk:db-migration` ou menção a SQL), variáveis de ambiente novas e mudança de comportamento de IA (`risk:ai-behavior`). Sem nada disso, escreva "Nada especial no deploy".

## Nota de negócio

- Linguagem de produto, sem jargão técnico, dizendo o que muda para quem usa.
- Junte os PRs da mesma task em um item só.
- O que não muda nada para quem usa (refatoração, CI, testes) fica fora; diga isso em uma linha no fim.

Com uma chave de task e sem descrição suficiente, chame `tarefa` para entender o efeito. PR sem task aparece com "task a confirmar".
