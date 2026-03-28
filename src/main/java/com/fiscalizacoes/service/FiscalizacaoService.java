package com.fiscalizacoes.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.io.IOException;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import javax.sql.DataSource;

@ApplicationScoped
public class FiscalizacaoService {

    private final ObjectMapper objectMapper;
    private final DataSource dataSource;
    @ConfigProperty(name = "app.mirror.enabled", defaultValue = "false")
    boolean mirrorEnabled;
    @ConfigProperty(name = "app.mirror.jdbc.url")
    Optional<String> mirrorJdbcUrl;
    @ConfigProperty(name = "app.mirror.username", defaultValue = "sa")
    String mirrorUsername;
    @ConfigProperty(name = "app.mirror.password", defaultValue = "sa")
    String mirrorPassword;

    @Inject
    public FiscalizacaoService(ObjectMapper objectMapper, DataSource dataSource) {
        this.objectMapper = objectMapper;
        this.dataSource = dataSource;
    }

    @PostConstruct
    void init() {
        ensureSchema();
        ensureMirrorSchema();
    }

    public List<Map<String, Object>> readRecords() {
        String sql = "SELECT payload FROM fiscalizacoes ORDER BY created_at ASC";

        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet resultSet = statement.executeQuery()) {
            List<Map<String, Object>> records = new ArrayList<>();
            while (resultSet.next()) {
                records.add(parsePayload(resultSet.getString("payload")));
            }
            return records;
        } catch (SQLException exception) {
            throw new IllegalStateException("Falha ao ler fiscalizacoes.", exception);
        }
    }

    public Map<String, Object> createRecord(Map<String, Object> record) {
        Map<String, Object> normalizedRecord = normalizeRecord(record);
        validateTipoFiscalizacao(normalizedRecord);

        try (Connection connection = dataSource.getConnection()) {
            ensureNoDuplicateIdentity(connection, normalizedRecord, null);
            insertRecord(connection, normalizedRecord);
            writeAuditInConnection(connection, "create", getRecordId(normalizedRecord), null, normalizedRecord, null);
        } catch (SQLException exception) {
            throw new IllegalStateException("Falha ao salvar fiscalizacao.", exception);
        }
        mirrorOperation(connection -> {
                ensureNoDuplicateIdentity(connection, normalizedRecord, null);
                insertRecord(connection, normalizedRecord);
                writeAuditInConnection(connection, "create", getRecordId(normalizedRecord), null, normalizedRecord, null);
            },
            "Falha ao espelhar fiscalizacao no banco local.");

        return normalizedRecord;
    }

    public List<Map<String, Object>> replaceAllRecords(List<Map<String, Object>> incomingRecords) {
        List<Map<String, Object>> normalizedRecords = new ArrayList<>();
        for (Map<String, Object> record : incomingRecords) {
            Map<String, Object> normalizedRecord = normalizeRecord(record);
            validateTipoFiscalizacao(normalizedRecord);
            normalizedRecords.add(normalizedRecord);
        }
        validateBatchIdentityUniqueness(normalizedRecords);

        try (Connection connection = dataSource.getConnection()) {
            int previousCount = countRecords(connection);
            replaceAllInConnection(connection, normalizedRecords);
            writeAuditInConnection(connection, "replace_all", null, null, null,
                Map.of("previousCount", previousCount, "nextCount", normalizedRecords.size()));
        } catch (SQLException exception) {
            throw new IllegalStateException("Falha ao substituir fiscalizacoes.", exception);
        }
        mirrorOperation(connection -> {
                int previousCount = countRecords(connection);
                replaceAllInConnection(connection, normalizedRecords);
                writeAuditInConnection(connection, "replace_all", null, null, null,
                    Map.of("previousCount", previousCount, "nextCount", normalizedRecords.size()));
            },
            "Falha ao espelhar fiscalizacoes no banco local.");
        return normalizedRecords;
    }

    public Optional<Map<String, Object>> updateRecord(String id, Map<String, Object> incoming) {
        String findSql = "SELECT payload FROM fiscalizacoes WHERE backend_id = ?";
        String updateSql = "UPDATE fiscalizacoes SET payload = ?, updated_at = CURRENT_TIMESTAMP WHERE backend_id = ?";

        try (Connection connection = dataSource.getConnection();
             PreparedStatement findStatement = connection.prepareStatement(findSql)) {
            findStatement.setString(1, id);

            Map<String, Object> currentRecord;
            try (ResultSet resultSet = findStatement.executeQuery()) {
                if (!resultSet.next()) {
                    return Optional.empty();
                }
                currentRecord = parsePayload(resultSet.getString("payload"));
            }

            Map<String, Object> mergedRecord = new LinkedHashMap<>(currentRecord);
            if (incoming != null) {
                mergedRecord.putAll(incoming);
            }
            mergedRecord.put("__backendId", id);
            Map<String, Object> normalizedRecord = normalizeRecord(mergedRecord);
            validateTipoFiscalizacao(normalizedRecord);
            ensureNoDuplicateIdentity(connection, normalizedRecord, id);

            try (PreparedStatement updateStatement = connection.prepareStatement(updateSql)) {
                updateStatement.setString(1, toJson(normalizedRecord));
                updateStatement.setString(2, id);
                int updatedRows = updateStatement.executeUpdate();
                if (updatedRows == 0) {
                    return Optional.empty();
                }
            }
            writeAuditInConnection(connection, "update", id, currentRecord, normalizedRecord, null);
            mirrorOperation(mirrorConnection -> {
                    upsertRecord(mirrorConnection, normalizedRecord);
                    writeAuditInConnection(mirrorConnection, "update", id, currentRecord, normalizedRecord, null);
                },
                "Falha ao espelhar fiscalizacao atualizada no banco local.");
            return Optional.of(normalizedRecord);
        } catch (SQLException exception) {
            throw new IllegalStateException("Falha ao atualizar fiscalizacao.", exception);
        }
    }

    public boolean deleteRecord(String id) {
        String findSql = "SELECT payload FROM fiscalizacoes WHERE backend_id = ?";
        String deleteSql = "DELETE FROM fiscalizacoes WHERE backend_id = ?";

        try (Connection connection = dataSource.getConnection();
             PreparedStatement findStatement = connection.prepareStatement(findSql);
             PreparedStatement deleteStatement = connection.prepareStatement(deleteSql)) {
            findStatement.setString(1, id);
            Map<String, Object> beforeRecord = null;
            try (ResultSet resultSet = findStatement.executeQuery()) {
                if (resultSet.next()) {
                    beforeRecord = parsePayload(resultSet.getString("payload"));
                }
            }

            deleteStatement.setString(1, id);
            boolean removed = deleteStatement.executeUpdate() > 0;
            if (!removed) {
                return false;
            }

            writeAuditInConnection(connection, "delete", id, beforeRecord, null, null);
            Map<String, Object> finalBeforeRecord = beforeRecord;
            mirrorOperation(mirrorConnection -> {
                    deleteRecordInConnection(mirrorConnection, id);
                    writeAuditInConnection(mirrorConnection, "delete", id, finalBeforeRecord, null, null);
                },
                "Falha ao espelhar exclusao de fiscalizacao no banco local.");
            return true;
        } catch (SQLException exception) {
            throw new IllegalStateException("Falha ao excluir fiscalizacao.", exception);
        }
    }

    public int deleteAllRecords() {
        String sql = "DELETE FROM fiscalizacoes";

        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            int previousCount = countRecords(connection);
            int deleted = statement.executeUpdate();
            writeAuditInConnection(connection, "delete_all", null, null, null,
                Map.of("deleted", deleted, "previousCount", previousCount));
            mirrorOperation(mirrorConnection -> {
                    int mirrorPreviousCount = countRecords(mirrorConnection);
                    deleteAllInConnection(mirrorConnection);
                    writeAuditInConnection(mirrorConnection, "delete_all", null, null, null,
                        Map.of("deleted", mirrorPreviousCount, "previousCount", mirrorPreviousCount));
                },
                "Falha ao espelhar exclusao de fiscalizacoes no banco local.");
            return deleted;
        } catch (SQLException exception) {
            throw new IllegalStateException("Falha ao excluir fiscalizacoes.", exception);
        }
    }

    private String getRecordId(Map<String, Object> record) {
        Object value = record.get("__backendId");
        return value == null ? null : String.valueOf(value);
    }

    private Map<String, Object> normalizeRecord(Map<String, Object> record) {
        Map<String, Object> normalized = new LinkedHashMap<>();
        if (record != null) {
            normalized.putAll(record);
        }

        Object backendId = normalized.get("__backendId");
        if (backendId == null || String.valueOf(backendId).isBlank()) {
            normalized.put("__backendId", UUID.randomUUID().toString());
        }

        return normalized;
    }

    private void validateTipoFiscalizacao(Map<String, Object> record) {
        String tipo = String.valueOf(record.getOrDefault("direta_indireta", "")).trim();
        if (!tipo.isEmpty() && !"direta".equalsIgnoreCase(tipo) && !"indireta".equalsIgnoreCase(tipo)) {
            throw new IllegalArgumentException("Campo direta_indireta deve ser \"Direta\" ou \"Indireta\".");
        }
    }

    private String normalizeIdentityPart(Object value) {
        return String.valueOf(value == null ? "" : value)
            .toLowerCase()
            .trim()
            .replaceAll("\\s+", "");
    }

    private String buildIdentityKey(Map<String, Object> record) {
        if (record == null) {
            return "";
        }

        String idPart = normalizeIdentityPart(record.get("id"));
        String processoPart = normalizeIdentityPart(record.get("processo_sei"));
        if (idPart.isBlank() && processoPart.isBlank()) {
            return "";
        }
        return idPart + "::" + processoPart;
    }

    private void validateBatchIdentityUniqueness(List<Map<String, Object>> records) {
        Set<String> identities = new HashSet<>();
        for (Map<String, Object> record : records) {
            String identity = buildIdentityKey(record);
            if (identity.isBlank()) {
                continue;
            }
            if (identities.contains(identity)) {
                throw new IllegalArgumentException("A lista enviada contem duplicidade de ID + Processo SEI.");
            }
            identities.add(identity);
        }
    }

    private void ensureNoDuplicateIdentity(Connection connection, Map<String, Object> candidate, String excludingBackendId) throws SQLException {
        String candidateIdentity = buildIdentityKey(candidate);
        if (candidateIdentity.isBlank()) {
            return;
        }

        String sql = "SELECT backend_id, payload FROM fiscalizacoes";
        try (PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet resultSet = statement.executeQuery()) {
            while (resultSet.next()) {
                String backendId = resultSet.getString("backend_id");
                if (excludingBackendId != null && !excludingBackendId.isBlank() && excludingBackendId.equals(backendId)) {
                    continue;
                }
                Map<String, Object> existingRecord = parsePayload(resultSet.getString("payload"));
                if (candidateIdentity.equals(buildIdentityKey(existingRecord))) {
                    throw new IllegalArgumentException("Ja existe fiscalizacao com mesmo ID e Processo SEI.");
                }
            }
        }
    }

    private void ensureSchema() {
        try (Connection connection = dataSource.getConnection()) {
            ensureSchema(connection);
        } catch (SQLException exception) {
            throw new IllegalStateException("Falha ao preparar schema da tabela fiscalizacoes.", exception);
        }
    }

    private void ensureSchema(Connection connection) throws SQLException {
        String dataTableDdl = """
            CREATE TABLE IF NOT EXISTS fiscalizacoes (
              backend_id VARCHAR(128) PRIMARY KEY,
              payload TEXT NOT NULL,
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """;
        String auditTableDdl = """
            CREATE TABLE IF NOT EXISTS fiscalizacoes_audit (
              audit_id VARCHAR(128) PRIMARY KEY,
              backend_id VARCHAR(128),
              action VARCHAR(64) NOT NULL,
              payload_before TEXT,
              payload_after TEXT,
              metadata TEXT,
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """;

        try (PreparedStatement statement = connection.prepareStatement(dataTableDdl)) {
            statement.execute();
        }
        try (PreparedStatement statement = connection.prepareStatement(auditTableDdl)) {
            statement.execute();
        }
    }

    private void ensureMirrorSchema() {
        mirrorOperation(this::ensureSchema, "Falha ao preparar schema espelhado de fiscalizacoes.");
    }

    private void insertRecord(Connection connection, Map<String, Object> record) throws SQLException {
        String sql = "INSERT INTO fiscalizacoes (backend_id, payload) VALUES (?, ?)";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, getRecordId(record));
            statement.setString(2, toJson(record));
            statement.executeUpdate();
        }
    }

    private void replaceAllInConnection(Connection connection, List<Map<String, Object>> records) throws SQLException {
        boolean originalAutoCommit = connection.getAutoCommit();
        connection.setAutoCommit(false);
        try {
            deleteAllInConnection(connection);
            for (Map<String, Object> record : records) {
                insertRecord(connection, record);
            }
            connection.commit();
        } catch (SQLException exception) {
            connection.rollback();
            throw exception;
        } finally {
            connection.setAutoCommit(originalAutoCommit);
        }
    }

    private void upsertRecord(Connection connection, Map<String, Object> record) throws SQLException {
        boolean originalAutoCommit = connection.getAutoCommit();
        connection.setAutoCommit(false);
        try {
            deleteRecordInConnection(connection, getRecordId(record));
            insertRecord(connection, record);
            connection.commit();
        } catch (SQLException exception) {
            connection.rollback();
            throw exception;
        } finally {
            connection.setAutoCommit(originalAutoCommit);
        }
    }

    private void deleteRecordInConnection(Connection connection, String id) throws SQLException {
        String sql = "DELETE FROM fiscalizacoes WHERE backend_id = ?";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, id);
            statement.executeUpdate();
        }
    }

    private void deleteAllInConnection(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("DELETE FROM fiscalizacoes")) {
            statement.executeUpdate();
        }
    }

    private int countRecords(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("SELECT COUNT(1) AS total FROM fiscalizacoes");
             ResultSet resultSet = statement.executeQuery()) {
            if (!resultSet.next()) {
                return 0;
            }
            return resultSet.getInt("total");
        }
    }

    private void writeAuditInConnection(
        Connection connection,
        String action,
        String backendId,
        Map<String, Object> beforeRecord,
        Map<String, Object> afterRecord,
        Map<String, Object> metadata
    ) throws SQLException {
        String sql = """
            INSERT INTO fiscalizacoes_audit (
              audit_id,
              backend_id,
              action,
              payload_before,
              payload_after,
              metadata,
              created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """;

        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, UUID.randomUUID().toString());
            statement.setString(2, backendId);
            statement.setString(3, action);
            statement.setString(4, toJsonObject(beforeRecord));
            statement.setString(5, toJsonObject(afterRecord));
            statement.setString(6, toJsonObject(metadata));
            statement.executeUpdate();
        }
    }

    private boolean isMirrorEnabled() {
        return mirrorEnabled && mirrorJdbcUrl.filter(url -> !url.isBlank()).isPresent();
    }

    private void mirrorOperation(SqlOperation operation, String errorMessage) {
        if (!isMirrorEnabled()) {
            return;
        }
        String jdbcUrl = mirrorJdbcUrl.orElseThrow(() ->
            new IllegalStateException("URL do espelhamento nao configurada."));
        try (Connection mirrorConnection = DriverManager.getConnection(jdbcUrl, mirrorUsername, mirrorPassword)) {
            ensureSchema(mirrorConnection);
            operation.execute(mirrorConnection);
        } catch (SQLException exception) {
            throw new IllegalStateException(errorMessage, exception);
        }
    }

    @FunctionalInterface
    private interface SqlOperation {
        void execute(Connection connection) throws SQLException;
    }

    private Map<String, Object> parsePayload(String payload) {
        try {
            Map<String, Object> parsed = objectMapper.readValue(payload, new TypeReference<Map<String, Object>>() {
            });
            return normalizeRecord(parsed);
        } catch (IOException exception) {
            throw new IllegalStateException("Falha ao interpretar fiscalizacao armazenada.", exception);
        }
    }

    private String toJson(Map<String, Object> record) {
        return toJsonObject(record);
    }

    private String toJsonObject(Object payload) {
        if (payload == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (IOException exception) {
            throw new IllegalStateException("Falha ao serializar payload JSON.", exception);
        }
    }
}
