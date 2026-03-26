package com.fiscalizacoes.api;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.is;

@QuarkusTest
class ObraResourceTest {

    @Test
    void shouldListObras() {
        given()
            .when()
            .get("/api/obras")
            .then()
            .statusCode(200)
            .body("$", hasKey("records"));
    }

    @Test
    void shouldReplaceAllObras() {
        given()
            .contentType("application/json")
            .body("""
                {
                  "records": [
                    {
                      "__obraId": "obra-1",
                      "item": "1",
                      "local": "Plano Piloto",
                      "situacao_contrato": "Em execucao"
                    },
                    {
                      "__obraId": "obra-2",
                      "item": "2",
                      "local": "Gama",
                      "situacao_contrato": "Em recebimento"
                    }
                  ]
                }
                """)
            .when()
            .put("/api/obras")
            .then()
            .statusCode(200)
            .body("records.size()", is(2));

        given()
            .when()
            .get("/api/obras")
            .then()
            .statusCode(200)
            .body("records.size()", is(2))
            .body("records[0].__obraId", is("obra-1"));
    }

    @Test
    void shouldReplaceObrasWithEmptyList() {
        given()
            .contentType("application/json")
            .body("""
                {
                  "records": [
                    {
                      "__obraId": "obra-x",
                      "item": "99",
                      "local": "Sobradinho"
                    }
                  ]
                }
                """)
            .when()
            .put("/api/obras")
            .then()
            .statusCode(200);

        given()
            .contentType("application/json")
            .body("""
                {
                  "records": []
                }
                """)
            .when()
            .put("/api/obras")
            .then()
            .statusCode(200)
            .body("records.size()", is(0));

        given()
            .when()
            .get("/api/obras")
            .then()
            .statusCode(200)
            .body("records.size()", is(0));
    }
}
