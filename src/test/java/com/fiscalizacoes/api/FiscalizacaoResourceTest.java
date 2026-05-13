package com.fiscalizacoes.api;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.is;

@QuarkusTest
class FiscalizacaoResourceTest {

    @Test
    void shouldListRecords() {
        given()
            .when()
            .get("/api/fiscalizacoes")
            .then()
            .statusCode(200)
            .body("$", hasKey("records"));
    }

    @Test
    void shouldAcceptIndirectaRecords() {
        given()
            .contentType("application/json")
            .body("{\"id\":\"FISC-IND-1\",\"processo_sei\":\"00001/2026\",\"direta_indireta\":\"Indireta\"}")
            .when()
            .post("/api/fiscalizacoes")
            .then()
            .statusCode(201)
            .body("$", hasKey("record"))
            .body("record.direta_indireta", containsString("Indireta"));
    }

    @Test
    void shouldReplaceAllRecords() {
        given()
            .header("X-Confirm-Bulk-Operation", "delete-all")
            .when()
            .delete("/api/fiscalizacoes")
            .then()
            .statusCode(200);

        given()
            .contentType("application/json")
            .header("X-Confirm-Bulk-Operation", "replace-all")
            .body("{\"records\":[{\"id\":\"FISC-BULK-1\",\"processo_sei\":\"00002/2026\",\"direta_indireta\":\"Direta\"},{\"id\":\"FISC-BULK-2\",\"processo_sei\":\"00003/2026\",\"direta_indireta\":\"Indireta\"}]}")
            .when()
            .put("/api/fiscalizacoes")
            .then()
            .statusCode(200)
            .body("records.size()", is(2))
            .body("records[0].direta_indireta", containsString("Direta"))
            .body("records[1].direta_indireta", containsString("Indireta"));
    }

    @Test
    void shouldDeleteAllRecords() {
        given()
            .header("X-Confirm-Bulk-Operation", "delete-all")
            .when()
            .delete("/api/fiscalizacoes")
            .then()
            .statusCode(200);

        given()
            .contentType("application/json")
            .body("{\"id\":\"FISC-DEL-1\",\"processo_sei\":\"00004/2026\",\"direta_indireta\":\"Direta\"}")
            .when()
            .post("/api/fiscalizacoes")
            .then()
            .statusCode(201);

        given()
            .header("X-Confirm-Bulk-Operation", "delete-all")
            .when()
            .delete("/api/fiscalizacoes")
            .then()
            .statusCode(200)
            .body("deleted", greaterThanOrEqualTo(1));

        given()
            .when()
            .get("/api/fiscalizacoes")
            .then()
            .statusCode(200)
            .body("records.size()", is(0));
    }
}
