package main

import (
	"encoding/base64"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
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

func splitArgs(raw string) ([]string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}

	var out []string
	var buf []rune
	var quote rune
	escaped := false

	flush := func() {
		if len(buf) == 0 {
			return
		}
		out = append(out, string(buf))
		buf = buf[:0]
	}

	for _, r := range raw {
		if escaped {
			buf = append(buf, r)
			escaped = false
			continue
		}
		if r == '\\' {
			escaped = true
			continue
		}
		if quote != 0 {
			if r == quote {
				quote = 0
				continue
			}
			buf = append(buf, r)
			continue
		}
		if r == '"' || r == '\'' {
			quote = r
			continue
		}
		if r == ' ' || r == '\t' || r == '\n' || r == '\r' {
			flush()
			continue
		}
		buf = append(buf, r)
	}

	if escaped {
		buf = append(buf, '\\')
	}
	if quote != 0 {
		return nil, errors.New("invalid arguments: unmatched quote")
	}
	flush()
	return out, nil
}

func (a *App) LaunchGame(exePath string, args string) error {
	exePath = strings.TrimSpace(exePath)
	if exePath == "" {
		return errors.New("game executable path is empty")
	}

	info, err := os.Stat(exePath)
	if err != nil {
		return fmt.Errorf("unable to access executable: %w", err)
	}
	if info.IsDir() {
		return errors.New("executable path points to a directory")
	}

	parts, err := splitArgs(args)
	if err != nil {
		return err
	}
	cmd := exec.Command(exePath, parts...)
	cmd.Dir = filepath.Dir(exePath)

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to launch game: %w", err)
	}

	runtime.LogInfo(a.ctx, "launched game: "+exePath)
	return nil
}

func (a *App) ShowNativeMessage(title string, message string) {
	title = strings.TrimSpace(title)
	message = strings.TrimSpace(message)
	if title == "" {
		title = "Game Launcher"
	}
	if message == "" {
		message = "Something went wrong."
	}
	_, _ = runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:    runtime.InfoDialog,
		Title:   title,
		Message: message,
	})
}
