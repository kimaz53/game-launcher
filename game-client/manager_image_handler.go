package main

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// managerImageHandler serves files from the shared manager data directory for GET /manager-img?p=<relative-path>.
// The frontend uses this instead of ReadManagerImageDataURL so image bytes are not duplicated as huge base64 strings in JS.
type managerImageHandler struct {
	app *App
}

func (h *managerImageHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	p := strings.TrimSpace(r.URL.Query().Get("p"))
	if p == "" {
		http.NotFound(w, r)
		return
	}
	dataDir, err := h.app.managerDataDir()
	if err != nil {
		http.NotFound(w, r)
		return
	}
	clean := filepath.Clean(filepath.FromSlash(p))
	if strings.HasPrefix(clean, "..") {
		http.NotFound(w, r)
		return
	}
	full := filepath.Join(dataDir, clean)
	resolved, err := filepath.Rel(dataDir, full)
	if err != nil || strings.HasPrefix(resolved, "..") {
		http.NotFound(w, r)
		return
	}
	st, err := os.Stat(full)
	if err != nil || st.IsDir() {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "private, max-age=300")
	http.ServeFile(w, r, full)
}
