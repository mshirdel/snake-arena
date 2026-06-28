package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
)

func TestProductionUIServesRootWithoutShadowingAPI(t *testing.T) {
	uiDir := t.TempDir()
	indexPath := filepath.Join(uiDir, "index.html")
	if err := os.WriteFile(indexPath, []byte("<!doctype html><title>Snake</title>"), 0o644); err != nil {
		t.Fatalf("write test index: %v", err)
	}

	e := echo.New()
	e.GET("/health", handleHealth)
	registerProductionUI(e, uiDir)

	rootReq := httptest.NewRequest(http.MethodGet, "/", nil)
	rootRec := httptest.NewRecorder()
	e.ServeHTTP(rootRec, rootReq)

	if rootRec.Code != http.StatusOK {
		t.Fatalf("GET / status = %d, want %d", rootRec.Code, http.StatusOK)
	}
	if !strings.Contains(rootRec.Body.String(), "<title>Snake</title>") {
		t.Fatalf("GET / body = %q, want production UI index", rootRec.Body.String())
	}

	healthReq := httptest.NewRequest(http.MethodGet, "/health", nil)
	healthRec := httptest.NewRecorder()
	e.ServeHTTP(healthRec, healthReq)

	if healthRec.Code != http.StatusOK {
		t.Fatalf("GET /health status = %d, want %d", healthRec.Code, http.StatusOK)
	}
	if !strings.Contains(healthRec.Body.String(), `"status":"healthy"`) {
		t.Fatalf("GET /health body = %q, want health JSON", healthRec.Body.String())
	}
}
