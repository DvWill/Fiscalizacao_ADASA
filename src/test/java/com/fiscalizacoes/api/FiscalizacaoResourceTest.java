package com.fiscalizacoes.api;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasKey;

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
    void shouldRejectNonDirectRecords() {
        given()
            .contentType("application/json")
            .body("{\"direta_indireta\":\"Indireta\"}")
            .when()
            .post("/api/fiscalizacoes")
            .then()
            .statusCode(400)
            .body("error", containsString("Direta"));
    }
}
