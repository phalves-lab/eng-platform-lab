# AGENTS.md

Laboratório da plataforma de engenharia: esteira completa (gates, segurança, review de IA com contexto de negócio, merge queue) rodando sobre um app sintético. Nada aqui é código ou dado de empresa.

## Estrutura

- `apps/api`: API sintética de solicitações de campanha (Fastify, Zod, Postgres). Regra de negócio em `src/domain`, HTTP em `src/http`, banco em `src/db` e `migrations/`.
- `tools/review-bot`: CLI do bot de review, fontes de contexto (fixtures ou Atlassian somente leitura) e escrita no Atlassian com confirmação.
- `review/`: prompt versionado, rubrica e golden set do bot.
- `catalog/modules/`: dono, tier, BUs e caminhos de cada módulo.
- `policy/`: rulesets, regras de risco, Semgrep e política de IA, como código.
- `fixtures/`: tasks e páginas sintéticas usadas no CI.

## Comandos

- `npm ci`: instala tudo (workspaces).
- `npm run verify`: lint, format, typecheck, testes com cobertura e build. É o mesmo gate do CI.
- `npm run diff-coverage -- origin/main`: cobertura das linhas alteradas (mínimo 70%).
- `npm run review -- review --base origin/main --dry-run`: mostra o prompt que o bot montaria.
- Testes de integração precisam de `DATABASE_URL` apontando para um Postgres; sem ele são pulados localmente e rodam no CI.

## Regras de código

- TypeScript strict; `any` proibido.
- Regra de negócio fica no domínio e devolve `Result`; a camada HTTP só traduz.
- Toda regra de negócio nova tem teste que falha se a regra for removida.
- Migração de banco é compatível com a versão anterior (expandir e contrair).
- Código sem comentário solto. Quando algo não é óbvio, JSDoc curto na função.
- Identificadores em inglês; textos, PRs e documentação em português.

## Fluxo

- Branch: `tipo/CHAVE-123-slug` (ex.: `feat/LAB-1-aprovacao-dupla`). Nunca commit direto em `main`.
- Commits e título do PR em Conventional Commits.
- PR com as seções do template preenchidas: Contexto de negócio, O que mudou, Como testar, Uso de IA.
- Merge só pela merge queue, com squash.

## O que não fazer

- Não colocar código, dado ou credencial de empresa neste repositório. Ele é público.
- Não usar a fonte `atlassian` do bot no CI; ela é só local.
- Não adicionar caminho de aprovação ou merge ao bot.
