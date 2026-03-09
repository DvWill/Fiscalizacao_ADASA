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

## Endpoints

- `GET /api/fiscalizacoes`
- `POST /api/fiscalizacoes`
- `PUT /api/fiscalizacoes/{id}`
- `DELETE /api/fiscalizacoes/{id}`
