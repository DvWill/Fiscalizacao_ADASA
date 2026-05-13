package com.fiscalizacoes.api;

import jakarta.annotation.Priority;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.Optional;

@Provider
@Priority(Priorities.AUTHENTICATION)
public class ApiSecurityFilter implements ContainerRequestFilter {

    @ConfigProperty(name = "app.auth.required", defaultValue = "true")
    boolean authRequired;

    @ConfigProperty(name = "app.api.token")
    Optional<String> apiToken;

    @Override
    public void filter(ContainerRequestContext requestContext) throws IOException {
        String path = requestContext.getUriInfo().getPath();
        if (!path.startsWith("api/")) {
            return;
        }

        if (!authRequired) {
            return;
        }

        String expectedToken = apiToken.orElse("").trim();
        if (expectedToken.isBlank()) {
            abort(requestContext, Response.Status.SERVICE_UNAVAILABLE,
                "Autenticacao obrigatoria nao configurada no servidor.");
            return;
        }

        String authorization = requestContext.getHeaderString(HttpHeaders.AUTHORIZATION);
        String providedToken = parseBearerToken(authorization);
        if (providedToken.isBlank() || !safeEquals(providedToken, expectedToken)) {
            abort(requestContext, Response.Status.UNAUTHORIZED, "Nao autorizado.");
            return;
        }

        if (isBulkOperation(requestContext) && !hasBulkConfirmation(requestContext)) {
            abort(requestContext, Response.Status.BAD_REQUEST, "Confirmacao de operacao em massa ausente.");
        }
    }

    private boolean isBulkOperation(ContainerRequestContext requestContext) {
        String path = requestContext.getUriInfo().getPath();
        String method = requestContext.getMethod();
        boolean collectionPath = "api/fiscalizacoes".equals(path) || "api/obras".equals(path);
        return collectionPath && ("PUT".equalsIgnoreCase(method) || "DELETE".equalsIgnoreCase(method));
    }

    private boolean hasBulkConfirmation(ContainerRequestContext requestContext) {
        String expected = "DELETE".equalsIgnoreCase(requestContext.getMethod()) ? "delete-all" : "replace-all";
        String provided = requestContext.getHeaderString("X-Confirm-Bulk-Operation");
        return expected.equals(String.valueOf(provided).trim());
    }

    private String parseBearerToken(String headerValue) {
        String raw = String.valueOf(headerValue == null ? "" : headerValue).trim();
        if (!raw.regionMatches(true, 0, "Bearer ", 0, 7)) {
            return "";
        }
        return raw.substring(7).trim();
    }

    private boolean safeEquals(String left, String right) {
        byte[] leftBytes = String.valueOf(left).getBytes(StandardCharsets.UTF_8);
        byte[] rightBytes = String.valueOf(right).getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(leftBytes, rightBytes);
    }

    private void abort(ContainerRequestContext requestContext, Response.Status status, String message) {
        requestContext.abortWith(Response.status(status)
            .entity(Map.of("error", message))
            .build());
    }
}
