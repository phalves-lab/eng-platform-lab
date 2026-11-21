# Deploy do portal em Cloud Run

Guia para publicar `portal-api`, `portal-web` e `portal-worker` no Google Cloud Run a partir do GitHub Actions, autenticando por Workload Identity Federation (WIF), sem chave de conta de serviço guardada em secret. Nada aqui foi executado: o laboratório só constrói e escaneia as imagens no CI (`.github/workflows/images.yml`). Os valores entre `<>` são do ambiente de quem for publicar.

## Visão geral

| Serviço         | Recurso no Cloud Run                          | Porta | Probe                                                     |
| --------------- | --------------------------------------------- | ----- | --------------------------------------------------------- |
| `portal-api`    | Service, ingress interno                      | 4100  | startup em `GET /health/ready`, liveness em `GET /health` |
| `portal-web`    | Service, ingress público atrás do login       | 3200  | startup e liveness em `GET /api/health`                   |
| `portal-worker` | Job executado pelo Cloud Scheduler (`--once`) | n/a   | código de saída do job                                    |

- O navegador só fala com o `portal-web`; o `portal-web` chama a `portal-api` pelo servidor (`PORTAL_API_URL`). A API fica com ingress `internal` e só aceita chamadas da conta de serviço do front.
- O worker roda como Job a cada hora com `--once`. Ele aplica as migrations antes de coletar, então em toda release ele roda antes da API nova.
- Banco: Cloud SQL para PostgreSQL 16, acessado pelo conector do Cloud Run (`--add-cloudsql-instances`).
- Segredos: Secret Manager, montados como variável de ambiente. Nenhum segredo entra na imagem nem no repositório.

## Imagens

Os três Dockerfiles ficam em `apps/<serviço>/Dockerfile` e usam a raiz do repositório como contexto:

```bash
docker build -f apps/portal-api/Dockerfile -t portal-api:local .
docker build -f apps/portal-web/Dockerfile -t portal-web:local .
docker build -f apps/portal-worker/Dockerfile -t portal-worker:local .
```

- Multi-stage: o estágio de build roda `npm ci` e compila só os pacotes do serviço; o estágio final leva o `dist`, as dependências de produção (`npm ci --omit=dev -w <serviço>`) e os arquivos de dados (handbook, catálogo e fixtures).
- Base `node:22-alpine` fixada por digest, sem `npm`, `npx` e `yarn` no estágio final, usuário `node` (não root) e `HEALTHCHECK` declarado.
- `portal-web` usa a saída `standalone` do Next (`PORTAL_WEB_STANDALONE=true` só no build da imagem).
- `portal-worker` sobe com `--conditions=@lab/dist`, que faz o `@lab/eng-metrics` resolver para o `dist` compilado.

## Workload Identity Federation

Configuração feita uma vez por projeto, por alguém com papel de administrador de IAM:

```bash
PROJECT_ID=<PROJECT_ID>
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
REPO=phalves-lab/eng-platform-lab

gcloud iam workload-identity-pools create github \
  --project "$PROJECT_ID" --location global --display-name "GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc eng-platform-lab \
  --project "$PROJECT_ID" --location global --workload-identity-pool github \
  --issuer-uri https://token.actions.githubusercontent.com \
  --attribute-mapping 'google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref' \
  --attribute-condition "assertion.repository == '$REPO' && assertion.ref == 'refs/heads/main'"

gcloud iam service-accounts create portal-deployer --project "$PROJECT_ID"

gcloud iam service-accounts add-iam-policy-binding \
  "portal-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
  --project "$PROJECT_ID" --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"
```

- A condição do provider aceita só este repositório e só a branch `main`: PR, fork ou outra branch não conseguem trocar o token do GitHub por credencial do Google.
- A conta `portal-deployer` recebe só o necessário: `roles/run.developer`, `roles/artifactregistry.writer` no repositório de imagens e `roles/iam.serviceAccountUser` nas contas de runtime abaixo (não no projeto inteiro).
- Cada serviço roda com a própria conta de runtime (`portal-api-run`, `portal-web-run`, `portal-worker-run`), com `roles/cloudsql.client` para API e worker e `roles/secretmanager.secretAccessor` apenas nos segredos que usa.

## Workflow de deploy (exemplo, não versionado)

O laboratório não tem ambiente, então o workflow abaixo é referência. Ao adotar, fixe cada action por SHA e mantenha `permissions` mínimas.

```yaml
name: deploy

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    permissions:
      contents: read
      id-token: write
    env:
      REGISTRY: <REGION>-docker.pkg.dev/<PROJECT_ID>/portal
    steps:
      - uses: actions/checkout@<SHA> # v7
        with:
          persist-credentials: false
      - uses: google-github-actions/auth@<SHA> # v3
        with:
          workload_identity_provider: projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github/providers/eng-platform-lab
          service_account: portal-deployer@<PROJECT_ID>.iam.gserviceaccount.com
      - uses: google-github-actions/setup-gcloud@<SHA> # v3
      - run: gcloud auth configure-docker <REGION>-docker.pkg.dev --quiet
      - name: Build e push das imagens
        run: |
          for app in portal-api portal-web portal-worker; do
            docker build -f "apps/$app/Dockerfile" -t "$REGISTRY/$app:$GITHUB_SHA" .
            docker push "$REGISTRY/$app:$GITHUB_SHA"
          done
      - name: Migrations e coleta (worker)
        run: |
          gcloud run jobs update portal-worker --region <REGION> \
            --image "$REGISTRY/portal-worker:$GITHUB_SHA" --args=--once
          gcloud run jobs execute portal-worker --region <REGION> --wait
      - name: API
        run: gcloud run deploy portal-api --region <REGION> --image "$REGISTRY/portal-api:$GITHUB_SHA"
      - name: Front
        run: gcloud run deploy portal-web --region <REGION> --image "$REGISTRY/portal-web:$GITHUB_SHA"

  register:
    needs: deploy
    if: always()
    permissions:
      contents: read
      deployments: write
    uses: ./.github/workflows/deploy-event.yml
    with:
      status: ${{ needs.deploy.result == 'success' && 'success' || 'failure' }}
```

A ordem segue a regra das releases: banco e back antes do front. O job `register` chama o `deploy-event.yml`, que alimenta a tela Entregas > DORA com o resultado do deploy.

## Configuração dos serviços

Criação inicial de cada serviço (as atualizações seguintes só trocam a imagem):

```bash
gcloud run deploy portal-api --region <REGION> \
  --image <REGION>-docker.pkg.dev/<PROJECT_ID>/portal/portal-api:<SHA> \
  --service-account portal-api-run@<PROJECT_ID>.iam.gserviceaccount.com \
  --ingress internal --no-allow-unauthenticated --port 4100 \
  --add-cloudsql-instances <PROJECT_ID>:<REGION>:portal \
  --startup-probe httpGet.path=/health/ready,initialDelaySeconds=5,periodSeconds=5,failureThreshold=12 \
  --liveness-probe httpGet.path=/health,periodSeconds=30 \
  --set-env-vars NODE_ENV=production,PORTAL_AUTH_MODE=entra \
  --set-secrets DATABASE_URL=portal-database-url:latest,PORTAL_LLM_API_KEY=portal-llm-key:latest
```

| Variável                                                    | Serviço     | Origem                                        |
| ----------------------------------------------------------- | ----------- | --------------------------------------------- |
| `NODE_ENV=production`                                       | todos       | env                                           |
| `PORTAL_AUTH_MODE=entra`, `PORTAL_JWKS_URL`, `PORTAL_JWT_*` | api         | env (o modo `dev` falha em produção)          |
| `DATABASE_URL`                                              | api, worker | Secret Manager                                |
| `PORTAL_LLM_BASE_URL`, `PORTAL_LLM_MODEL`                   | api         | env                                           |
| `PORTAL_LLM_API_KEY`                                        | api         | Secret Manager                                |
| `PORTAL_GITHUB_TOKEN`, `GITHUB_TOKEN`                       | api, worker | Secret Manager (token só leitura)             |
| `PORTAL_API_URL`                                            | web         | env, URL interna da `portal-api`              |
| `OTEL_ENABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT`               | api, worker | env                                           |
| `OTEL_EXPORTER_OTLP_HEADERS`                                | api, worker | Secret Manager, se o coletor exigir           |
| `APP_VERSION`                                               | api, worker | env, o SHA do commit (vira `service.version`) |

## Observabilidade

- API e worker exportam traces (HTTP, `pg` e `fetch`) e métricas por OTLP/HTTP quando `OTEL_ENABLED=true`. No Cloud Run, o caminho simples é um contêiner auxiliar com o OpenTelemetry Collector no mesmo serviço (`OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`) exportando para Cloud Trace e Cloud Monitoring com a conta de runtime.
- Antes de sair do processo, os spans perdem query string, endereço do cliente e user agent; o SQL vai sem valores dos parâmetros.
- Logs saem em JSON no stdout, uma linha por evento, com `requestId` (aceito de `x-request-id` quando bem formado e devolvido na resposta) e `traceId` do span ativo ou do cabeçalho `traceparent`. O Cloud Logging indexa os campos do JSON; para o nível aparecer como severidade nativa e o log ligar ao trace no console, falta mapear `level` para `severity` e `traceId` para `logging.googleapis.com/trace`, o que fica para quando houver ambiente.
- Readiness: `GET /health/ready` responde 503 enquanto o banco não responde `SELECT 1` em 2 s ou o handbook não carregou. A resposta nunca traz host, usuário, URL do gateway ou nome do modelo.

## Rollback

Cada deploy cria uma revisão. Para voltar, aponte o tráfego para a anterior:

```bash
gcloud run services update-traffic portal-api --region <REGION> --to-revisions <REVISÃO>=100
```

Migration nova só expande o schema (regra do `packages/database`), então a revisão anterior da API continua compatível com o banco migrado.

## Desenvolvimento integrado com as imagens

```bash
docker compose -f docker-compose.portal.yml up --build
```

Sobe Postgres, worker (conjunto `demo`, Jira e DORA por fixture, scorecard em volume), API em modo de autenticação `dev` e front. Portas trocáveis por `PORTAL_DB_PORT` (padrão 5434), `PORTAL_API_PORT` (4100) e `PORTAL_WEB_PORT` (3200). Para parar sem apagar os dados: `docker compose -f docker-compose.portal.yml down`.
