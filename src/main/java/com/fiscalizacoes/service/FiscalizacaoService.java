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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import javax.sql.DataSource;

@ApplicationScoped
public class FiscalizacaoService {

    private final ObjectMapper objectMapper;
    private final DataSource dataSource;
    @ConfigProperty(name = "app.mirror.enabled", defaultValue = "false")
    boolean mirrorEnabled;
    @ConfigProperty(name = "app.mirror.jdbc.url", defaultValue = "")
    String mirrorJdbcUrl;
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
            insertRecord(connection, normalizedRecord);
        } catch (SQLException exception) {
            throw new IllegalStateException("Falha ao salvar fiscalizacao.", exception);
        }
        mirrorOperation(connection -> insertRecord(connection, normalizedRecord),
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

        try (Connection connection = dataSource.getConnection()) {
            replaceAllInConnection(connection, normalizedRecords);
        } catch (SQLException exception) {
            throw new IllegalStateException("Falha ao substituir fiscalizacoes.", exception);
        }
        mirrorOperation(connection -> replaceAllInConnection(connection, normalizedRecords),
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

            try (PreparedStatement updateStatement = connection.prepareStatement(updateSql)) {
                updateStatement.setString(1, toJson(normalizedRecord));
                updateStatement.setString(2, id);
                int updatedRows = updateStatement.executeUpdate();
                if (updatedRows == 0) {
                    return Optional.empty();
                }
            }
            mirrorOperation(mirrorConnection -> upsertRecord(mirrorConnection, normalizedRecord),
                "Falha ao espelhar fiscalizacao atualizada no banco local.");
            return Optional.of(normalizedRecord);
        } catch (SQLException exception) {
            throw new IllegalStateException("Falha ao atualizar fiscalizacao.", exception);
        }
    }

    public boolean deleteRecord(String id) {
        String sql = "DELETE FROM fiscalizacoes WHERE backend_id = ?";

        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, id);
            boolean removed = statement.executeUpdate() > 0;
            mirrorOperation(mirrorConnection -> deleteRecordInConnection(mirrorConnection, id),
                "Falha ao espelhar exclusao de fiscalizacao no banco local.");
            return removed;
        } catch (SQLException exception) {
            throw new IllegalStateException("Falha ao excluir fiscalizacao.", exception);
        }
    }

    public int deleteAllRecords() {
        String sql = "DELETE FROM fiscalizacoes";

        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            int deleted = statement.executeUpdate();
            mirrorOperation(this::deleteAllInConnection,
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

    private void ensureSchema() {
        try (Connection connection = dataSource.getConnection()) {
            ensureSchema(connection);
        } catch (SQLException exception) {
            throw new IllegalStateException("Falha ao preparar schema da tabela fiscalizacoes.", exception);
        }
    }

    private void ensureSchema(Connection connection) throws SQLException {
        String ddl = """
            CREATE TABLE IF NOT EXISTS fiscalizacoes (
              backend_id VARCHAR(128) PRIMARY KEY,
              payload TEXT NOT NULL,
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """;

        try (PreparedStatement statement = connection.prepareStatement(ddl)) {
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

    private boolean isMirrorEnabled() {
        return mirrorEnabled && mirrorJdbcUrl != null && !mirrorJdbcUrl.isBlank();
    }

    private void mirrorOperation(SqlOperation operation, String errorMessage) {
        if (!isMirrorEnabled()) {
            return;
        }
        try (Connection mirrorConnection = DriverManager.getConnection(mirrorJdbcUrl, mirrorUsername, mirrorPassword)) {
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
        try {
            return objectMapper.writeValueAsString(record);
        } catch (IOException exception) {
            throw new IllegalStateException("Falha ao serializar fiscalizacao.", exception);
        }
    }
}
