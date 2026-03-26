package com.fiscalizacoes.api;

import com.fiscalizacoes.service.ObraService;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Path("/api/obras")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class ObraResource {

    @Inject
    ObraService obraService;

    @GET
    public Response list() {
        try {
            return Response.ok(Map.of("records", obraService.readRecords())).build();
        } catch (RuntimeException exception) {
            return internalError("Falha ao carregar obras.");
        }
    }

    @PUT
    public Response replaceAll(Map<String, Object> body) {
        try {
            Object recordsValue = body == null ? null : body.get("records");
            if (!(recordsValue instanceof List<?> rawRecords)) {
                return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Campo records deve ser uma lista."))
                    .build();
            }

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> records = (List<Map<String, Object>>) (List<?>) rawRecords;
            List<Map<String, Object>> savedRecords = obraService.replaceAllRecords(records);
            return Response.ok(Map.of("records", savedRecords)).build();
        } catch (IllegalArgumentException exception) {
            return Response.status(Response.Status.BAD_REQUEST)
                .entity(Map.of("error", exception.getMessage()))
                .build();
        } catch (RuntimeException exception) {
            return internalError("Falha ao salvar obras.");
        }
    }

    @DELETE
    public Response deleteAll() {
        try {
            int deleted = obraService.deleteAllRecords();
            return Response.ok(Map.of("deleted", deleted)).build();
        } catch (RuntimeException exception) {
            return internalError("Falha ao excluir obras.");
        }
    }

    private Response internalError(String message) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("error", message);
        return Response.status(Response.Status.INTERNAL_SERVER_ERROR).entity(payload).build();
    }
}
