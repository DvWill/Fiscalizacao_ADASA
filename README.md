<<<<<<< HEAD
# Fiscalizacao_ADASA
=======
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

## Endpoints

- `GET /api/fiscalizacoes`
- `POST /api/fiscalizacoes`
- `PUT /api/fiscalizacoes/{id}`
- `DELETE /api/fiscalizacoes/{id}`
>>>>>>> 0c2a4e9 (Atualizacoes, bd add, diretas apenas, CRUD)
