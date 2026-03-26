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
import java.util.UUID;
import javax.sql.DataSource;

@ApplicationScoped
public class ObraService {

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
    public ObraService(ObjectMapper objectMapper, DataSource dataSource) {
        this.objectMapper = objectMapper;
        this.dataSource = dataSource;
    }

    @PostConstruct
    void init() {
        ensureSchema();
        ensureMirrorSchema();
    }

    public List<Map<String, Object>> readRecords() {
        String sql = "SELECT payload FROM obras ORDER BY created_at ASC";

        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet resultSet = statement.executeQuery()) {
            List<Map<String, Object>> records = new ArrayList<>();
            while (resultSet.next()) {
                records.add(parsePayload(resultSet.getString("payload")));
            }
            return records;
        } catch (SQLException exception) {
            throw new IllegalStateException("Falha ao ler obras.", exception);
        }
    }

    public List<Map<String, Object>> replaceAllRecords(List<Map<String, Object>> incomingRecords) {
        List<Map<String, Object>> normalizedRecords = new ArrayList<>();
        for (Map<String, Object> record : incomingRecords) {
            normalizedRecords.add(normalizeRecord(record));
        }

        try (Connection connection = dataSource.getConnection()) {
            replaceAllInConnection(connection, normalizedRecords);
        } catch (SQLException exception) {
            throw new IllegalStateException("Falha ao substituir obras.", exception);
        }
        mirrorOperation(connection -> replaceAllInConnection(connection, normalizedRecords),
            "Falha ao espelhar obras no banco local.");
        return normalizedRecords;
    }

    public int deleteAllRecords() {
        String sql = "DELETE FROM obras";

        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            int deleted = statement.executeUpdate();
            mirrorOperation(this::deleteAllInConnection, "Falha ao espelhar exclusao de obras no banco local.");
            return deleted;
        } catch (SQLException exception) {
            throw new IllegalStateException("Falha ao excluir obras.", exception);
        }
    }

    private String getRecordId(Map<String, Object> record) {
        Object value = record.get("__obraId");
        return value == null ? null : String.valueOf(value);
    }

    private Map<String, Object> normalizeRecord(Map<String, Object> record) {
        Map<String, Object> normalized = new LinkedHashMap<>();
        if (record != null) {
            normalized.putAll(record);
        }

        Object obraId = normalized.get("__obraId");
        if (obraId == null || String.valueOf(obraId).isBlank()) {
            normalized.put("__obraId", UUID.randomUUID().toString());
        }

        return normalized;
    }

    private void ensureSchema() {
        try (Connection connection = dataSource.getConnection()) {
            ensureSchema(connection);
        } catch (SQLException exception) {
            throw new IllegalStateException("Falha ao preparar schema da tabela obras.", exception);
        }
    }

    private void ensureSchema(Connection connection) throws SQLException {
        String ddl = """
            CREATE TABLE IF NOT EXISTS obras (
              obra_id VARCHAR(128) PRIMARY KEY,
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
        mirrorOperation(this::ensureSchema, "Falha ao preparar schema espelhado de obras.");
    }

    private void insertRecord(Connection connection, Map<String, Object> record) throws SQLException {
        String insertSql = "INSERT INTO obras (obra_id, payload) VALUES (?, ?)";
        try (PreparedStatement insertStatement = connection.prepareStatement(insertSql)) {
            insertStatement.setString(1, getRecordId(record));
            insertStatement.setString(2, toJson(record));
            insertStatement.executeUpdate();
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

    private void deleteAllInConnection(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("DELETE FROM obras")) {
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
            throw new IllegalStateException("Falha ao interpretar obra armazenada.", exception);
        }
    }

    private String toJson(Map<String, Object> record) {
        try {
            return objectMapper.writeValueAsString(record);
        } catch (IOException exception) {
            throw new IllegalStateException("Falha ao serializar obra.", exception);
        }
    }
}
