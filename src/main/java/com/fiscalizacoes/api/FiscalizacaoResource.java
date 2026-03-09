package com.fiscalizacoes.api;

import com.fiscalizacoes.service.FiscalizacaoService;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

@Path("/api/fiscalizacoes")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class FiscalizacaoResource {

    @Inject
    FiscalizacaoService fiscalizacaoService;

    @GET
    public Response list() {
        try {
            return Response.ok(Map.of("records", fiscalizacaoService.readRecords())).build();
        } catch (RuntimeException exception) {
            return internalError("Falha ao carregar fiscalizacoes.");
        }
    }

    @POST
    public Response create(Map<String, Object> body) {
        try {
            Map<String, Object> record = fiscalizacaoService.createRecord(body);
            return Response.status(Response.Status.CREATED).entity(Map.of("record", record)).build();
        } catch (IllegalArgumentException exception) {
            return Response.status(Response.Status.BAD_REQUEST)
                .entity(Map.of("error", exception.getMessage()))
                .build();
        } catch (RuntimeException exception) {
            return internalError("Falha ao salvar fiscalizacao.");
        }
    }

    @PUT
    @Path("/{id}")
    public Response update(@PathParam("id") String id, Map<String, Object> body) {
        try {
            Optional<Map<String, Object>> updated = fiscalizacaoService.updateRecord(id, body);

            if (updated.isEmpty()) {
                return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "Fiscalizacao nao encontrada."))
                    .build();
            }

            return Response.ok(Map.of("record", updated.get())).build();
        } catch (IllegalArgumentException exception) {
            return Response.status(Response.Status.BAD_REQUEST)
                .entity(Map.of("error", exception.getMessage()))
                .build();
        } catch (RuntimeException exception) {
            return internalError("Falha ao atualizar fiscalizacao.");
        }
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("id") String id) {
        try {
            boolean removed = fiscalizacaoService.deleteRecord(id);
            if (!removed) {
                return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "Fiscalizacao nao encontrada."))
                    .build();
            }

            return Response.noContent().build();
        } catch (RuntimeException exception) {
            return internalError("Falha ao excluir fiscalizacao.");
        }
    }

    private Response internalError(String message) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("error", message);
        return Response.status(Response.Status.INTERNAL_SERVER_ERROR).entity(payload).build();
    }
}
