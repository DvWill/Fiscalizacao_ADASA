package com.fiscalizacoes.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import javax.sql.DataSource;

@ApplicationScoped
public class FiscalizacaoService {

    private final ObjectMapper objectMapper;
    private final DataSource dataSource;

    @Inject
    public FiscalizacaoService(ObjectMapper objectMapper, DataSource dataSource) {
        this.objectMapper = objectMapper;
        this.dataSource = dataSource;
    }

    @PostConstruct
    void init() {
        ensureSchema();
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
        validateDiretaOnly(normalizedRecord);
        String sql = "INSERT INTO fiscalizacoes (backend_id, payload) VALUES (?, ?)";

        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, getRecordId(normalizedRecord));
            statement.setString(2, toJson(normalizedRecord));
            statement.executeUpdate();
        } catch (SQLException exception) {
            throw new IllegalStateException("Falha ao salvar fiscalizacao.", exception);
        }

        return normalizedRecord;
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
            validateDiretaOnly(normalizedRecord);

            try (PreparedStatement updateStatement = connection.prepareStatement(updateSql)) {
                updateStatement.setString(1, toJson(normalizedRecord));
                updateStatement.setString(2, id);
                int updatedRows = updateStatement.executeUpdate();
                if (updatedRows == 0) {
                    return Optional.empty();
                }
            }

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
            return statement.executeUpdate() > 0;
        } catch (SQLException exception) {
            throw new IllegalStateException("Falha ao excluir fiscalizacao.", exception);
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

    private void validateDiretaOnly(Map<String, Object> record) {
        String tipo = String.valueOf(record.getOrDefault("direta_indireta", "")).trim();
        if (!"direta".equalsIgnoreCase(tipo)) {
            throw new IllegalArgumentException("Apenas fiscalizacoes do tipo \"Direta\" sao permitidas.");
        }
    }

    private void ensureSchema() {
        String ddl = """
            CREATE TABLE IF NOT EXISTS fiscalizacoes (
              backend_id VARCHAR(128) PRIMARY KEY,
              payload TEXT NOT NULL,
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """;

        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(ddl)) {
            statement.execute();
        } catch (SQLException exception) {
            throw new IllegalStateException("Falha ao preparar schema da tabela fiscalizacoes.", exception);
        }
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
