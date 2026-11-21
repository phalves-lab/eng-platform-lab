# portal-worker

Worker de coleta do portal de engenharia. Cada coletor implementa `Collector` (`name`, `schedule`, `run(ctx)`) e o `Scheduler` roda todos no boot e a cada intervalo, sem sobrepor execuções do mesmo coletor. O log sai em JSON, uma linha por evento. As migrations de `packages/database` são aplicadas no boot.

## Coletores

| Coletor       | O que faz                                                                               | Liga com                                     |
| ------------- | --------------------------------------------------------------------------------------- | -------------------------------------------- |
| `eng-metrics` | Calcula a fila de review e as métricas do `tools/eng-metrics` e grava o snapshot do dia | sempre                                       |
| `jira`        | Espelha issues, transições de status, sprints e épicos do Jira no Postgres              | `WORKER_JIRA_SOURCE=fixture` ou `cloud`      |
| `ai-quality`  | Grava os runs dos golden sets e o uso de IA publicados no artefato `ai-quality`         | `WORKER_AI_EVALS_SOURCE=fixture` ou `github` |

## Coletor do Jira

O coletor fala com o Jira só por leitura e grava com upsert idempotente pelo `JiraRepository`: rodar duas vezes não duplica nada. Nenhum caminho de código escreve no Jira.

- **Adaptador fixture** (`fixture`): lê `fixtures/jira-board/*.json`, um arquivo por projeto fictício (`LAB` e `OPS`, dois componentes cada, 10 semanas de histórico com bloqueios e itens envelhecendo). As datas andam em semanas inteiras até a semana atual, então o board continua vivo sem editar o arquivo.
- **Adaptador Jira Cloud** (`cloud`): REST v3 `POST /rest/api/3/search/jql` com `expand=changelog` e paginação por `nextPageToken`, changelog extra por `GET /rest/api/3/issue/{key}/changelog` quando a busca corta o histórico, e sprints pela agile API (`GET /rest/agile/1.0/board/{id}/sprint`). O cliente HTTP só expõe `GET` e a busca, autentica por e-mail e token e respeita `Retry-After` em 429 e 503 (até 3 tentativas, espera máxima de 60 s).
- **Workflow**: o mapa de status para categoria (a fazer, em andamento, em review, bloqueado, concluído) fica em `catalog/jira/workflow.yaml`, com status extras por projeto. O status cru é gravado como veio; a categoria é aplicada na leitura, então mudar o YAML não exige coletar de novo. Status sem categoria aparece no log como `jira.unmapped_statuses`.

### Rodar uma vez com o adaptador fixture

```bash
docker compose up -d
DATABASE_URL=postgres://lab:lab@localhost:5433/lab npm run collect:jira -w @lab/portal-worker
```

O comando aplica as migrations, roda o coletor uma vez e sai com código 1 se a coleta falhar. Para ligar o coletor no worker agendado, defina `WORKER_JIRA_SOURCE` junto das demais variáveis.

### Variáveis

| Variável                                                   | Padrão                                | Uso                                                      |
| ---------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------- |
| `WORKER_JIRA_SOURCE`                                       | `off` no worker, `fixture` no comando | `off`, `fixture` ou `cloud`                              |
| `WORKER_JIRA_FIXTURES_DIR`                                 | `fixtures/jira-board`                 | Pasta das fixtures do adaptador fixture                  |
| `WORKER_JIRA_WORKFLOW`                                     | `catalog/jira/workflow.yaml`          | Mapa de status para categoria                            |
| `WORKER_JIRA_PROJECTS`                                     | vazio                                 | Chaves dos projetos no Jira Cloud, separadas por vírgula |
| `WORKER_JIRA_BOARDS`                                       | vazio                                 | Boards de onde vêm as sprints, como `LAB=12,OPS=34`      |
| `WORKER_JIRA_SPRINT_FIELD`                                 | `customfield_10020`                   | Campo de sprint da instância                             |
| `WORKER_JIRA_LOOKBACK_DAYS`                                | `120`                                 | Janela de issues atualizadas (épicos entram sempre)      |
| `ATLASSIAN_SITE`, `ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN` | vazio                                 | Credenciais só de leitura do adaptador `cloud`           |

## Coletor de qualidade de IA

Lê os arquivos que o golden set do bot, o golden set do chat e o review do bot publicam no artefato `ai-quality` (contrato em `packages/contracts/src/ai-quality.ts`) e grava os runs em `ai_eval_runs` e o uso por chamada em `ai_usage_records`. O id de cada run e de cada registro torna a coleta idempotente. Registro que chega só com tokens recebe o custo estimado pela tabela `catalog/ai/pricing.yaml`, com a versão da tabela. Arquivo fora do contrato vira aviso no log e não para a coleta; falha de download falha a execução no fim.

- **Adaptador fixture** (`fixture`): lê os `*.json` de `fixtures/ai-evals` (sintéticos) ou da pasta em `WORKER_AI_EVALS_DIR`.
- **Adaptador GitHub** (`github`): `GET /repos/{repo}/actions/artifacts?name=ai-quality` e `GET /repos/{repo}/actions/artifacts/{id}/zip` dos artefatos mais novos ainda válidos. Só faz `GET`.

```bash
DATABASE_URL=postgres://lab:lab@localhost:5433/lab npm run collect:ai -w @lab/portal-worker
```

| Variável                        | Padrão                                | Uso                                                |
| ------------------------------- | ------------------------------------- | -------------------------------------------------- |
| `WORKER_AI_EVALS_SOURCE`        | `off` no worker, `fixture` no comando | `off`, `fixture` ou `github`                       |
| `WORKER_AI_EVALS_DIR`           | `fixtures/ai-evals`                   | Pasta do adaptador fixture                         |
| `WORKER_AI_PRICING`             | `catalog/ai/pricing.yaml`             | Tabela de preço usada para estimar o custo         |
| `WORKER_AI_EVALS_REPOSITORY`    | `GITHUB_REPOSITORY`                   | Repositório dos workflows, no formato `owner/nome` |
| `WORKER_AI_EVALS_MAX_ARTIFACTS` | `30`                                  | Quantos artefatos mais novos ler por execução      |
| `GITHUB_TOKEN`                  | vazio                                 | Token só de leitura do adaptador `github`          |
