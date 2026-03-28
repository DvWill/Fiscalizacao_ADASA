# Fiscalizacoes (Quarkus)

Aplicacao migrada para Quarkus com:

- Frontend estatico em `src/main/resources/META-INF/resources`
- API REST em `/api/fiscalizacoes`
- Persistencia em PostgreSQL (ex.: Neon)

## Requisitos

- Java 17+
- Maven 3.9+

## Rodar em desenvolvimento

Defina as variaveis de ambiente antes de subir:

```powershell
$env:JDBC_DATABASE_URL="jdbc:postgresql://HOST/DB?sslmode=require"
$env:DB_USER="SEU_USUARIO"
$env:DB_PASSWORD="SUA_SENHA"
```

```bash
mvn quarkus:dev
```

A aplicacao sobe em `http://localhost:8080`.

## Deploy

Para a API ficar disponivel no deploy, rode a aplicacao Java (Quarkus) em um host de backend
(Render, Railway, Fly.io, etc.). Apenas subir os arquivos no GitHub/GitHub Pages nao executa API.

Variaveis obrigatorias no ambiente:

- `JDBC_DATABASE_URL`
- `DB_USER`
- `DB_PASSWORD`

Porta:

- A aplicacao usa `PORT` automaticamente (fallback `8080`).

## Deploy no Vercel (Serverless)

Este projeto inclui funcoes em `api/fiscalizacoes.js` e `api/obras.js` para uso no Vercel.

- Endpoints:
  - `/api/fiscalizacoes` (`GET`, `POST`, `PUT`, `DELETE`)
  - `/api/obras` (`GET`, `PUT`, `DELETE`)
- Reescrita para ID: `vercel.json` mapeia `/api/fiscalizacoes/:id` para a funcao.

Persistencia: as funcoes usam PostgreSQL (`pg`) e exigem a variavel de ambiente:

- `NEON_DATABASE_URL` (ou `DATABASE_URL`)
- Opcional de seguranca:
  - `API_TOKEN` (se definido, exige `Authorization: Bearer <token>`)
  - `AUTH_LOGIN` e `AUTH_PASSWORD` (se definidos, exigem login/senha via tela de login)
  - `AUTH_SESSION_SECRET` (recomendado para assinar cookie de sessao)
  - `AUTH_SESSION_TTL_SECONDS` (tempo de sessao em segundos; padrao 43200)
  - `CORS_ALLOWED_ORIGINS` (lista separada por virgula)
  - `CORS_ALLOW_ALL=true` (somente se voce realmente quiser liberar qualquer origem)

Exemplo:

```text
postgresql://USUARIO:SENHA@HOST/DB?sslmode=require&channel_binding=require
```

## Frontend local

Por padrao, o frontend usa `/api`. Para apontar para um backend externo, defina:

```html
<script>
  window.__FISCALIZACOES_API_BASE_URL__ = "https://seu-backend.com/api";
</script>
```

## Endpoints

- `GET /api/fiscalizacoes`
- `POST /api/fiscalizacoes`
- `PUT /api/fiscalizacoes?id={id}` (ou `/api/fiscalizacoes/{id}` via rewrite)
- `DELETE /api/fiscalizacoes?id={id}` (ou `/api/fiscalizacoes/{id}` via rewrite)
- `POST /api/auth/login` (login/senha)
- `GET /api/auth/me` (sessao atual)
- `POST /api/auth/logout` (encerrar sessao)
