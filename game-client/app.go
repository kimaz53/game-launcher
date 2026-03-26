package main

import (
	"encoding/base64"
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called at application startup
func (a *App) startup(ctx context.Context) {
	// Perform your setup here
	a.ctx = ctx
}

// domReady is called after front-end resources have been loaded
func (a App) domReady(ctx context.Context) {
	// Add your action here
}

// beforeClose is called when the application is about to quit,
// either by clicking the window close button or calling runtime.Quit.
// Returning true will cause the application to continue, false will continue shutdown as normal.
func (a *App) beforeClose(ctx context.Context) (prevent bool) {
	return false
}

// shutdown is called at application termination
func (a *App) shutdown(ctx context.Context) {
	// Perform your teardown here
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

func (a *App) GetComputerName() string {
	host, err := os.Hostname()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(host)
}

func (a *App) managerDataDir() (string, error) {
	// Prefer local data folder when running a packaged game-client build.
	exePath, err := os.Executable()
	if err == nil {
		exeDir := filepath.Dir(exePath)
		candidate := filepath.Join(exeDir, "data")
		if st, statErr := os.Stat(candidate); statErr == nil && st.IsDir() {
			return candidate, nil
		}
	}

	// Dev fallback: workspace layout ../game-manager/build/bin/data
	wd, err := os.Getwd()
	if err == nil {
		// 1) from game-client/frontend => ../build/bin/data
		candidate := filepath.Join(wd, "..", "build", "bin", "data")
		if st, statErr := os.Stat(candidate); statErr == nil && st.IsDir() {
			return candidate, nil
		}
		// 2) from game-client root => build/bin/data
		candidate = filepath.Join(wd, "build", "bin", "data")
		if st, statErr := os.Stat(candidate); statErr == nil && st.IsDir() {
			return candidate, nil
		}
		// 3) legacy fallback to game-manager data location
		candidate = filepath.Join(wd, "..", "game-manager", "build", "bin", "data")
		if st, statErr := os.Stat(candidate); statErr == nil && st.IsDir() {
			return candidate, nil
		}
	}

	// Extra fallback based on executable parent.
	if err == nil {
		exeDir := filepath.Dir(exePath)
		candidate := filepath.Join(exeDir, "..", "..", "game-manager", "build", "bin", "data")
		candidate = filepath.Clean(candidate)
		if st, statErr := os.Stat(candidate); statErr == nil && st.IsDir() {
			return candidate, nil
		}
	}

	return "", errors.New("manager data dir not found")
}

func (a *App) loadJSONOrDefault(filename string, fallback string) (string, error) {
	dataDir, err := a.managerDataDir()
	if err != nil {
		return fallback, nil
	}
	path := filepath.Join(dataDir, filename)
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return fallback, nil
	}
	if err != nil {
		return fallback, err
	}
	if len(strings.TrimSpace(string(b))) == 0 {
		return fallback, nil
	}
	return string(b), nil
}

func (a *App) LoadManagerGamesJSON() (string, error) {
	return a.loadJSONOrDefault("games.json", "[]")
}

func (a *App) LoadManagerCategoriesJSON() (string, error) {
	return a.loadJSONOrDefault("categories.json", "[]")
}

func (a *App) LoadManagerTagsJSON() (string, error) {
	return a.loadJSONOrDefault("tags.json", "[]")
}

func (a *App) LoadManagerQuickAccessJSON() (string, error) {
	return a.loadJSONOrDefault("quick-access.json", "[]")
}

func (a *App) LoadManagerSettingsJSON() (string, error) {
	return a.loadJSONOrDefault("settings.json", "{}")
}

func (a *App) ReadManagerImageDataURL(relPath string) string {
	relPath = strings.TrimSpace(relPath)
	if relPath == "" {
		return ""
	}
	dataDir, err := a.managerDataDir()
	if err != nil {
		return ""
	}
	clean := filepath.Clean(filepath.FromSlash(relPath))
	if strings.HasPrefix(clean, "..") {
		return ""
	}
	full := filepath.Join(dataDir, clean)
	resolved, err := filepath.Rel(dataDir, full)
	if err != nil || strings.HasPrefix(resolved, "..") {
		return ""
	}
	b, err := os.ReadFile(full)
	if err != nil {
		return ""
	}
	lower := strings.ToLower(full)
	mime := "image/png"
	switch {
	case strings.HasSuffix(lower, ".jpg"), strings.HasSuffix(lower, ".jpeg"):
		mime = "image/jpeg"
	case strings.HasSuffix(lower, ".webp"):
		mime = "image/webp"
	case strings.HasSuffix(lower, ".gif"):
		mime = "image/gif"
	case strings.HasSuffix(lower, ".ico"):
		mime = "image/x-icon"
	}
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(b)
}
