# eng-platform-lab

Laboratório da esteira de engenharia: gates, segurança, review de IA com contexto de negócio e merge queue, rodando sobre um app sintético de solicitações de campanha. Nada aqui é código ou dado de empresa.

## Stack

- Node 22, TypeScript strict, npm workspaces
- API: Fastify 5, Zod 4, Postgres via `pg` (migrations SQL em `apps/api/migrations`)
- Testes: Vitest com cobertura v8; Postgres real no CI
- Bot de review: Gemini API, Atlassian somente leitura (local), GitHub API só para comentar

## Arquitetura

- `apps/api/src/domain`: regras de negócio puras, devolvem `Result`, sem dependência de framework.
- `apps/api/src/http`: traduz HTTP para o domínio; `src/db`: repositório Postgres e migrations.
- `tools/review-bot`: monta contexto (task, critérios de aceite, módulo do catálogo, documentação, diff), revisa em 3 camadas, verifica achados graves e publica comentário fixo.
- `tools/eng-metrics`: coletor só leitura (GitHub e tasks) que calcula fila, alertas e métricas e publica o `data.json`. O contrato do arquivo fica em `src/contract.ts`.
- Resumo diário: `npm run digest -- --data <data.json>` monta o texto; o workflow `digest` roda às 9h em dia útil e só envia a um canal se o secret `DIGEST_WEBHOOK_URL` existir.
- `apps/portal-api`: API do portal em NestJS. Configuração validada com Zod no boot (falha se o modo de autenticação de desenvolvimento for usado em produção), guard global de autenticação (modo `dev` local ou token do Entra ID validado por JWKS), limite de requisições, módulos de handbook, review, pergunta e métricas de review (`GET /api/metrics/review`).
- `apps/portal-web`: front do portal em Next.js 15 com shadcn/ui no estilo do template de dashboard, menu lateral recolhível e busca com Ctrl K. Só conversa com a `portal-api`, pelo servidor (`src/lib/api.ts`). Os tokens de cor seguem os nomes do `@martech/design-system`; na Cogna, troca-se o bloco de tokens pelo do pacote.
- `packages/handbook` e `packages/contracts`: leitor do handbook e schemas Zod compartilhados entre API, front e servidor MCP. Em desenvolvimento são lidos pelo código-fonte (condição `@lab/source`); no build, pelo `dist`.
- `packages/catalog`: leitor do catálogo de IA. Lê um marketplace no formato do Claude Code (`.claude-plugin/marketplace.json`, `plugin.json` e `SKILL.md` de cada plugin) na pasta de `PORTAL_MARKETPLACE_DIR` (padrão `fixtures/marketplace`, sintético) e junta com o overlay versionado em `catalog/ai/` (`plugins.yaml` com maturidade, dono e revisão; `mcps.yaml` com os MCPs homologados), pasta trocável por `PORTAL_AI_CATALOG_DIR`. Plugin sem overlay aparece como `draft`, sem dono.
- Rodar o portal local: `npm run panel -- --only-demo --out "$PWD/.portal-data"`, `npm run build --workspace @lab/portal-api`, `PORTAL_HANDBOOK_DIR=$PWD/handbook PORTAL_PANEL_DATA=$PWD/.portal-data/data.json node apps/portal-api/dist/main.js` e `PORTAL_API_URL=http://localhost:4100 npm run dev --workspace @lab/portal-web`.
- `packages/database`: pool `pg`, runner de migrations SQL versionadas (`packages/database/migrations`, tabela de controle `portal_schema_migrations`, lock consultivo e checksum por arquivo) e repositórios tipados com Zod: `metric_snapshots`, `jira_issues`, `jira_status_changes`, `jira_sprints`, `deploys` e `incidents`. Migration nova só expande o schema; o teste `migrations.test.ts` barra `DROP`, `RENAME`, troca de tipo e coluna `NOT NULL` sem default. `@lab/database/testing` cria um schema descartável por arquivo de teste.
- `apps/portal-worker`: worker de coleta. Cada coletor implementa `Collector` (`name`, `schedule`, `run(ctx)`); o agendador roda no boot e a cada intervalo, sem sobrepor execuções do mesmo coletor, com log em JSON por linha. O coletor `eng-metrics` usa `collectPanelData` do `tools/eng-metrics` e grava o snapshot do dia (fuso `WORKER_TIMEZONE`) em `metric_snapshots`. Configuração validada com Zod: `DATABASE_URL`, `WORKER_INTERVAL_MINUTES` (padrão 60), `WORKER_DATASETS` (`lab`, `demo`), `WORKER_TASK_SOURCE` e as credenciais do GitHub quando o conjunto `lab` está ligado. O worker aplica as migrations no boot.
- `apps/portal-api` com `DATABASE_URL` lê o snapshot mais recente de cada conjunto no banco; sem ela, lê o `data.json` de `PORTAL_PANEL_DATA`. Sem snapshot gravado responde 503.
- `handbook/`: padrões numerados, sistemas, glossário e decisões pendentes do laboratório, no mesmo formato do handbook do time.
- `tools/mcp-context`: servidor MCP só de leitura sobre o handbook (ferramentas `regras_para_ia`, `padrao`, `buscar_padroes`, `sistema`, `buscar_sistemas`, `glossario`, `decisoes_pendentes`, `buscar`). Lê `handbook/` por padrão ou a pasta em `MARTECH_HANDBOOK_DIR`. Para registrar no Claude Code, no Kiro (já configurado em `.kiro/`) e em outros clientes, veja `tools/mcp-context/README.md`.
- `apps/panel`: app do painel (Vite, React e shadcn/ui), estático, lê só o `data.json` publicado ao lado. Componentes do shadcn ficam em `src/components/ui`. Para rodar local: `npm run panel -- --only-demo --out "$PWD/apps/panel/public"` e `npm run dev --workspace @lab/panel`.
- `review/`: prompts versionados, rubrica e golden set. `catalog/modules/`: dono, tier e caminhos de cada módulo. `policy/`: rulesets, risco, Semgrep e política de IA.
- `fixtures/`: tasks e páginas sintéticas usadas no CI.

## Comandos

- Instalar: `npm ci`
- Dev da API: `npm run dev -w @lab/api` (exige `DATABASE_URL`)
- Postgres local: `docker compose up -d` sobe o Postgres 16 na porta 5433 (volume `portal-db`, usuário, senha e banco `lab`). Use `DATABASE_URL=postgres://lab:lab@localhost:5433/lab` para os testes de integração e o worker; sem essa variável os testes de banco são pulados. Para zerar: `docker compose down -v`.
- Worker: `DATABASE_URL=postgres://lab:lab@localhost:5433/lab WORKER_DATASETS=demo npm run worker -w @lab/portal-worker -- --once` (sem `--once`, fica agendado até `SIGINT` ou `SIGTERM`).
- Gate completo (mesmo do CI): `npm run verify`
- Testes: `npm test`; cobertura do diff: `npm run diff-coverage -- origin/develop`
- Prompt do bot sem chamar modelo: `npm run review -- review --repo-dir "$PWD" --config-dir "$PWD" --base origin/develop --dry-run`

## Fluxo de trabalho (comum ao time)

- Gitflow: `develop` é a base de trabalho; `main` é produção. Nunca commitar direto em nenhuma das duas.
- Branch: `tipo/CHAVE-123-slug` (tipos: feat, fix, chore, docs, hotfix, refactor, test, ci; slug de 2 a 4 palavras em kebab-case), sempre a partir de `develop` atualizada.
- Commits e título do PR em Conventional Commits.
- PR para `develop`, template preenchido: linha **Task** com a chave, Contexto de negócio, O que mudou, Como testar. SQL obrigatório quando o diff mexe em migration; ENV obrigatório quando mexe em `.env.example`.
- PR para `main` só sai de `develop` (release) ou de `hotfix/*`. Hotfix volta para `develop`.
- Merge só pela merge queue, com squash.
- Mudança de comportamento atualiza a documentação do módulo antes do merge. Módulo novo entra no catálogo.
- Módulo novo pode ser cadastrado no próprio PR que o cria. O bot lê o catálogo da base e do PR; para módulo que já existe, dono, tier e página valem da base e o PR só acrescenta caminhos.

## Padrões deste repo

- Toda regra de negócio nova tem teste que falha se a regra for removida.
- Migração de banco compatível com a versão anterior (expandir e contrair) e com restrição no banco quando a regra for de integridade.
- Fontes do Atlassian só usam `ReadOnlyHttp`; escrita só via `propose`, com confirmação.
- O bot só comenta; nenhum caminho de código aprova, pede mudanças ou mergeia.
- Mudança em `review/` ou em `tools/review-bot/src/` recebe `risk:ai-behavior` e passa pelo golden set.

## Regras de código (comum ao time)

- TypeScript strict. `any` proibido; inferir tipos de schemas Zod quando existirem.
- Identificadores em inglês; documentação, mensagens e PRs em português.
- Erros com early return e tratamento explícito; nunca catch vazio.
- Código sem comentário solto; quando algo não é óbvio, JSDoc curto na função.
- Segredos só via env ou secret do CI. Nada de token, chave ou URL interna no código.

## O que NÃO fazer

- NÃO commitar ou mergear direto em `main` ou `develop`.
- NÃO usar `any`, `@ts-ignore` ou `eslint-disable` sem justificativa no PR.
- NÃO desligar teste ou usar `--passWithNoTests` para o CI passar.
- NÃO commitar `.env`, credenciais, `console.log` de debug ou código comentado.
- NÃO adicionar dependência nova sem justificar no PR.
- NÃO abrir PR sem a chave da task nem com o template vazio.
- NÃO colocar código, dado ou credencial de empresa neste repositório: ele é público.
- NÃO usar a fonte `atlassian` do bot no CI.
- NÃO deixar o agente de IA commitar sem ler o diff. O autor do PR é dono do código, gerado por IA ou não.
