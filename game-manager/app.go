package main

import (
	"context"
	"crypto/md5"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
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
	a.ctx = ctx
}

// domReady is called after front-end resources have been loaded
func (a App) domReady(ctx context.Context) {
}

// beforeClose is called when the application is about to quit,
// either by clicking the window close button or calling runtime.Quit.
// Returning true will cause the application to continue, false will continue shutdown as normal.
func (a *App) beforeClose(ctx context.Context) (prevent bool) {
	return false
}

// shutdown is called at application termination
func (a *App) shutdown(ctx context.Context) {
}

// portableDataDir returns <exe_dir>/data and ensures it exists (portable install).
func (a *App) portableDataDir() (string, error) {
	exePath, err := os.Executable()
	if err != nil {
		return "", err
	}
	dir := filepath.Dir(exePath)
	data := filepath.Join(dir, "data")
	if err := os.MkdirAll(data, 0o755); err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Join(data, "covers"), 0o755); err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Join(data, "icons"), 0o755); err != nil {
		return "", err
	}
	return data, nil
}

// GetDataDir returns the absolute portable data directory (for debugging / UI).
func (a *App) GetDataDir() string {
	d, err := a.portableDataDir()
	if err != nil {
		return ""
	}
	return d
}

// LoadGamesJSON reads games.json from the portable data directory, or returns "[]".
func (a *App) LoadGamesJSON() (string, error) {
	dataDir, err := a.portableDataDir()
	if err != nil {
		return "[]", err
	}
	path := filepath.Join(dataDir, "games.json")
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return "[]", nil
	}
	if err != nil {
		return "[]", err
	}
	if len(strings.TrimSpace(string(b))) == 0 {
		return "[]", nil
	}
	return string(b), nil
}

// SaveGamesJSON writes the games library as JSON (array) to games.json.
func (a *App) SaveGamesJSON(payload string) error {
	var decoded []json.RawMessage
	if err := json.Unmarshal([]byte(payload), &decoded); err != nil {
		return fmt.Errorf("invalid games json: %w", err)
	}
	dataDir, err := a.portableDataDir()
	if err != nil {
		return err
	}
	path := filepath.Join(dataDir, "games.json")
	return os.WriteFile(path, []byte(payload), 0o644)
}

func (a *App) loadStringArrayJSON(relFilename string) ([]string, error) {
	dataDir, err := a.portableDataDir()
	if err != nil {
		return nil, err
	}
	path := filepath.Join(dataDir, relFilename)
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return []string{}, nil
	}
	if err != nil {
		return nil, err
	}
	if len(strings.TrimSpace(string(b))) == 0 {
		return []string{}, nil
	}

	var decoded []string
	if err := json.Unmarshal(b, &decoded); err != nil {
		return nil, err
	}
	return decoded, nil
}

func (a *App) saveStringArrayJSON(relFilename string, payload string) error {
	var decoded []string
	if err := json.Unmarshal([]byte(payload), &decoded); err != nil {
		return fmt.Errorf("invalid %s json: %w", relFilename, err)
	}
	dataDir, err := a.portableDataDir()
	if err != nil {
		return err
	}
	path := filepath.Join(dataDir, relFilename)
	return os.WriteFile(path, []byte(payload), 0o644)
}

func (a *App) loadIntArrayJSON(relFilename string) ([]int, error) {
	dataDir, err := a.portableDataDir()
	if err != nil {
		return nil, err
	}
	path := filepath.Join(dataDir, relFilename)
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return []int{}, nil
	}
	if err != nil {
		return nil, err
	}
	if len(strings.TrimSpace(string(b))) == 0 {
		return []int{}, nil
	}

	var decoded []int
	if err := json.Unmarshal(b, &decoded); err != nil {
		return nil, err
	}

	out := make([]int, 0, len(decoded))
	seen := make(map[int]struct{})
	for _, v := range decoded {
		if v <= 0 {
			continue
		}
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	return out, nil
}

func (a *App) saveIntArrayJSON(relFilename string, payload string) error {
	var decoded []int
	if err := json.Unmarshal([]byte(payload), &decoded); err != nil {
		return fmt.Errorf("invalid %s json: %w", relFilename, err)
	}

	out := make([]int, 0, len(decoded))
	seen := make(map[int]struct{})
	for _, v := range decoded {
		if v <= 0 {
			continue
		}
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}

	dataDir, err := a.portableDataDir()
	if err != nil {
		return err
	}
	path := filepath.Join(dataDir, relFilename)
	b, err := json.Marshal(out)
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o644)
}

type CategoryDefinition struct {
	Name        string `json:"name"`
	IconRelPath string `json:"iconRelPath,omitempty"`
	IconDataURL string `json:"iconDataUrl,omitempty"`
}

// LoadCategoriesJSON reads categories.json from the portable data directory, or returns "[]".
func (a *App) LoadCategoriesJSON() (string, error) {
	dataDir, err := a.portableDataDir()
	if err != nil {
		return "[]", err
	}
	path := filepath.Join(dataDir, "categories.json")
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return "[]", nil
	}
	if err != nil {
		return "[]", err
	}
	if len(strings.TrimSpace(string(b))) == 0 {
		return "[]", nil
	}

	// New format: array of objects.
	var defs []CategoryDefinition
	if err := json.Unmarshal(b, &defs); err == nil {
		out := make([]CategoryDefinition, 0, len(defs))
		migrated := false
		// Avoid spending time/memory decoding gigantic base64 data URLs.
		const maxSafeIconDataUrlLen = 200_000
		for _, d := range defs {
			name := strings.TrimSpace(d.Name)
			if name == "" {
				continue
			}
			d.IconRelPath = strings.TrimSpace(d.IconRelPath)
			d.IconDataURL = strings.TrimSpace(d.IconDataURL)

			// Safety: avoid sending huge base64 strings over the Wails bridge.
			// If we don't already have icon files, only attempt migration for "reasonably sized" data URLs.
			if d.IconRelPath == "" && d.IconDataURL != "" {
				if len(d.IconDataURL) <= maxSafeIconDataUrlLen {
					rel, err := a.importCategoryIconDataURL(d.IconDataURL)
					if err == nil && rel != "" {
						d.IconRelPath = rel
						d.IconDataURL = ""
						migrated = true
					}
				} else {
					// Too big to safely migrate; drop it so category names still load quickly.
					d.IconDataURL = ""
					migrated = true
				}
			}

			// If we have a relPath, never return the data URL payload.
			if d.IconRelPath != "" {
				d.IconDataURL = ""
			}

			out = append(out, CategoryDefinition{
				Name:        name,
				IconRelPath: strings.TrimSpace(d.IconRelPath),
				IconDataURL: strings.TrimSpace(d.IconDataURL),
			})
		}
		b2, err := json.Marshal(out)
		if err != nil {
			return "[]", err
		}

		// Persist migration so future loads don't carry huge strings.
		if migrated {
			_ = os.WriteFile(path, b2, 0o644)
		}

		return string(b2), nil
	}

	// Backwards-compatible legacy format: array of strings.
	var legacy []string
	if err := json.Unmarshal(b, &legacy); err != nil {
		return "[]", err
	}

	out := make([]CategoryDefinition, 0, len(legacy))
	for _, name := range legacy {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		out = append(out, CategoryDefinition{Name: name})
	}
	b2, err := json.Marshal(out)
	if err != nil {
		return "[]", err
	}
	return string(b2), nil
}

// SaveCategoriesJSON writes categories.json as JSON (array of objects) to categories.json.
func (a *App) SaveCategoriesJSON(payload string) error {
	dataDir, err := a.portableDataDir()
	if err != nil {
		return err
	}
	path := filepath.Join(dataDir, "categories.json")

	// New format: array of objects.
	var defs []CategoryDefinition
	if err := json.Unmarshal([]byte(payload), &defs); err == nil {
		out := make([]CategoryDefinition, 0, len(defs))
		for _, d := range defs {
			name := strings.TrimSpace(d.Name)
			if name == "" {
				continue
			}
			out = append(out, CategoryDefinition{
				Name:        name,
				IconRelPath: strings.TrimSpace(d.IconRelPath),
				IconDataURL: strings.TrimSpace(d.IconDataURL),
			})
		}
		b, err := json.Marshal(out)
		if err != nil {
			return err
		}
		return os.WriteFile(path, b, 0o644)
	}

	// Legacy payload: array of strings.
	var legacy []string
	if err := json.Unmarshal([]byte(payload), &legacy); err != nil {
		return fmt.Errorf("invalid categories json: %w", err)
	}
	out := make([]CategoryDefinition, 0, len(legacy))
	for _, name := range legacy {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		out = append(out, CategoryDefinition{Name: name})
	}
	b, err := json.Marshal(out)
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o644)
}

// ImportCategoryIcon normalizes an arbitrary image into PNG and stores it under:
// data/category-icons/{hash}.png
//
// Returns the path relative to data/ (e.g. "category-icons/{hash}.png").
func (a *App) ImportCategoryIcon(sourcePath string) (string, error) {
	sourcePath = strings.TrimSpace(sourcePath)
	if sourcePath == "" {
		return "", nil
	}

	abs, err := filepath.Abs(sourcePath)
	if err != nil {
		abs = sourcePath
	}

	b, err := os.ReadFile(abs)
	if err != nil {
		return "", err
	}

	sum := md5.Sum(b)
	hash := hex.EncodeToString(sum[:])

	dataDir, err := a.portableDataDir()
	if err != nil {
		return "", err
	}

	rel := filepath.ToSlash(filepath.Join("category-icons", hash+".png"))
	dest := filepath.Join(dataDir, filepath.FromSlash(rel))

	// If we already normalized this exact file, reuse it.
	if st, err := os.Stat(dest); err == nil && st.Size() > 0 {
		return rel, nil
	}

	if err := os.MkdirAll(filepath.Join(dataDir, "category-icons"), 0o755); err != nil {
		return "", err
	}

	// Normalize to PNG using PowerShell + System.Drawing.
	safeIn := strings.ReplaceAll(abs, `'`, `''`)
	safeOut := strings.ReplaceAll(dest, `'`, `''`)
	ps := fmt.Sprintf(`
$ErrorActionPreference = 'Stop';
Add-Type -AssemblyName System.Drawing;
$img = [System.Drawing.Image]::FromFile('%s');
$bmp = New-Object System.Drawing.Bitmap($img);
$bmp.Save('%s', [System.Drawing.Imaging.ImageFormat]::Png);
`, safeIn, safeOut)

	cmd := exec.Command(
		"powershell",
		"-NoProfile",
		"-ExecutionPolicy",
		"Bypass",
		"-Command",
		ps,
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("import category icon failed: %w: %s", err, strings.TrimSpace(string(out)))
	}

	return rel, nil
}

// ImportGameIcon normalizes an arbitrary image, exe, or ico file into PNG and stores it under:
// data/icons/{hash}.png
//
// Returns the path relative to data/ (e.g. "icons/{hash}.png").
func (a *App) ImportGameIcon(sourcePath string) (string, error) {
	sourcePath = strings.TrimSpace(sourcePath)
	if sourcePath == "" {
		return "", nil
	}

	// Check if it's an exe file - if so, extract the icon
	if strings.HasSuffix(strings.ToLower(sourcePath), ".exe") ||
		strings.HasSuffix(strings.ToLower(sourcePath), ".bat") ||
		strings.HasSuffix(strings.ToLower(sourcePath), ".cmd") ||
		strings.HasSuffix(strings.ToLower(sourcePath), ".lnk") {
		return a.ExtractExecutableIcon(sourcePath)
	}

	abs, err := filepath.Abs(sourcePath)
	if err != nil {
		abs = sourcePath
	}

	b, err := os.ReadFile(abs)
	if err != nil {
		return "", err
	}

	sum := md5.Sum(b)
	hash := hex.EncodeToString(sum[:])

	dataDir, err := a.portableDataDir()
	if err != nil {
		return "", err
	}

	rel := filepath.ToSlash(filepath.Join("icons", hash+".png"))
	dest := filepath.Join(dataDir, filepath.FromSlash(rel))

	// If we already normalized this exact file, reuse it.
	if st, err := os.Stat(dest); err == nil && st.Size() > 0 {
		return rel, nil
	}

	if err := os.MkdirAll(filepath.Join(dataDir, "icons"), 0o755); err != nil {
		return "", err
	}

	// Normalize to PNG using PowerShell + System.Drawing, scaled to 256x256.
	safeIn := strings.ReplaceAll(abs, `'`, `''`)
	safeOut := strings.ReplaceAll(dest, `'`, `''`)
	ps := fmt.Sprintf(`
$ErrorActionPreference = 'Stop';
Add-Type -AssemblyName System.Drawing;
$img = [System.Drawing.Image]::FromFile('%s');
$size = New-Object System.Drawing.Size(256, 256);
$scaled = New-Object System.Drawing.Bitmap($img, $size);
$scaled.Save('%s', [System.Drawing.Imaging.ImageFormat]::Png);
`, safeIn, safeOut)

	cmd := exec.Command(
		"powershell",
		"-NoProfile",
		"-ExecutionPolicy",
		"Bypass",
		"-Command",
		ps,
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("import game icon failed: %w: %s", err, strings.TrimSpace(string(out)))
	}

	return rel, nil
}

// importCategoryIconDataURL imports an existing `data:` URL into data/category-icons/ as PNG.
// Used for migrating older entries that were stored as huge data URLs.
func (a *App) importCategoryIconDataURL(iconDataUrl string) (string, error) {
	iconDataUrl = strings.TrimSpace(iconDataUrl)
	if iconDataUrl == "" {
		return "", nil
	}

	comma := strings.Index(iconDataUrl, ",")
	if comma < 0 {
		return "", nil
	}

	meta := iconDataUrl[5:comma] // `image/<mime>;base64`
	b64 := iconDataUrl[comma+1:]
	if b64 == "" {
		return "", nil
	}

	decoded, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return "", nil
	}

	sum := md5.Sum(decoded)
	hash := hex.EncodeToString(sum[:])

	dataDir, err := a.portableDataDir()
	if err != nil {
		return "", err
	}

	rel := filepath.ToSlash(filepath.Join("category-icons", hash+".png"))
	dest := filepath.Join(dataDir, filepath.FromSlash(rel))

	if st, err := os.Stat(dest); err == nil && st.Size() > 0 {
		return rel, nil
	}

	if err := os.MkdirAll(filepath.Join(dataDir, "category-icons"), 0o755); err != nil {
		return "", err
	}

	// Determine a reasonable temp file extension based on mime.
	// (We always output PNG, but the input extension helps GDI+ interpret the bytes.)
	mime := meta
	if idx := strings.Index(mime, ";"); idx >= 0 {
		mime = mime[:idx]
	}
	ext := ".img"
	switch {
	case strings.Contains(mime, "png"):
		ext = ".png"
	case strings.Contains(mime, "jpeg"), strings.Contains(mime, "jpg"):
		ext = ".jpg"
	case strings.Contains(mime, "webp"):
		ext = ".webp"
	case strings.Contains(mime, "gif"):
		ext = ".gif"
	}

	tmp, err := os.CreateTemp("", "caticon-*"+ext)
	if err != nil {
		return "", err
	}
	tmpPath := tmp.Name()
	_, _ = tmp.Write(decoded)
	_ = tmp.Close()
	defer func() {
		_ = os.Remove(tmpPath)
	}()

	// Normalize to PNG using PowerShell + System.Drawing.
	safeIn := strings.ReplaceAll(tmpPath, `'`, `''`)
	safeOut := strings.ReplaceAll(dest, `'`, `''`)
	ps := fmt.Sprintf(`
$ErrorActionPreference = 'Stop';
Add-Type -AssemblyName System.Drawing;
$img = [System.Drawing.Image]::FromFile('%s');
$bmp = New-Object System.Drawing.Bitmap($img);
$bmp.Save('%s', [System.Drawing.Imaging.ImageFormat]::Png);
`, safeIn, safeOut)

	cmd := exec.Command(
		"powershell",
		"-NoProfile",
		"-ExecutionPolicy",
		"Bypass",
		"-Command",
		ps,
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("import category icon data URL failed: %w: %s", err, strings.TrimSpace(string(out)))
	}

	return rel, nil
}

// LoadTagsJSON reads tags.json from the portable data directory, or returns "[]".
func (a *App) LoadTagsJSON() (string, error) {
	tags, err := a.loadStringArrayJSON("tags.json")
	if err != nil {
		return "[]", err
	}
	b, err := json.Marshal(tags)
	if err != nil {
		return "[]", err
	}
	return string(b), nil
}

// SaveTagsJSON writes tags.json as JSON (array) to tags.json.
func (a *App) SaveTagsJSON(payload string) error {
	return a.saveStringArrayJSON("tags.json", payload)
}

// LoadQuickAccessJSON reads quick-access.json from the portable data directory, or returns "[]".
func (a *App) LoadQuickAccessJSON() (string, error) {
	ids, err := a.loadIntArrayJSON("quick-access.json")
	if err != nil {
		return "[]", err
	}
	b, err := json.Marshal(ids)
	if err != nil {
		return "[]", err
	}
	return string(b), nil
}

// SaveQuickAccessJSON writes quick-access.json as JSON (array of numbers) to quick-access.json.
func (a *App) SaveQuickAccessJSON(payload string) error {
	return a.saveIntArrayJSON("quick-access.json", payload)
}

// LinkEntry is a user-defined shortcut opened in the system browser from the game client header.
type LinkEntry struct {
	ID    int    `json:"id"`
	Label string `json:"label"`
	URL   string `json:"url"`
	// Icon is optional: relative path under the portable data dir (e.g. icons/link-1.png).
	Icon string `json:"icon,omitempty"`
}

// LoadLinksJSON reads links.json from the portable data directory, or returns "[]".
func (a *App) LoadLinksJSON() (string, error) {
	dataDir, err := a.portableDataDir()
	if err != nil {
		return "[]", err
	}
	path := filepath.Join(dataDir, "links.json")
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return "[]", nil
	}
	if err != nil {
		return "[]", err
	}
	if len(strings.TrimSpace(string(b))) == 0 {
		return "[]", nil
	}
	var decoded []LinkEntry
	if err := json.Unmarshal(b, &decoded); err != nil {
		return "[]", nil
	}
	out, err := json.Marshal(decoded)
	if err != nil {
		return "[]", err
	}
	return string(out), nil
}

// SaveLinksJSON writes links.json as a JSON array of {id,label,url,icon?}.
func (a *App) SaveLinksJSON(payload string) error {
	var decoded []LinkEntry
	if err := json.Unmarshal([]byte(payload), &decoded); err != nil {
		return fmt.Errorf("invalid links json: %w", err)
	}
	seen := map[int]struct{}{}
	nextID := 1
	out := make([]LinkEntry, 0, len(decoded))
	for _, e := range decoded {
		label := strings.TrimSpace(e.Label)
		rawURL := strings.TrimSpace(e.URL)
		if label == "" || rawURL == "" {
			continue
		}
		lower := strings.ToLower(rawURL)
		if !strings.HasPrefix(lower, "http://") && !strings.HasPrefix(lower, "https://") {
			return fmt.Errorf("link %q: url must start with http:// or https://", label)
		}
		id := e.ID
		_, dup := seen[id]
		if id <= 0 || dup {
			for {
				if _, ok := seen[nextID]; !ok {
					break
				}
				nextID++
			}
			id = nextID
			nextID++
		}
		seen[id] = struct{}{}
		icon := strings.TrimSpace(e.Icon)
		out = append(out, LinkEntry{ID: id, Label: label, URL: rawURL, Icon: icon})
	}
	dataDir, err := a.portableDataDir()
	if err != nil {
		return err
	}
	path := filepath.Join(dataDir, "links.json")
	b, err := json.Marshal(out)
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o644)
}

// ImportLinkIcon copies an image into data/icons/link-{linkID}{ext}. Returns a path relative to data/.
func (a *App) ImportLinkIcon(sourcePath string, linkID int) (string, error) {
	sourcePath = strings.TrimSpace(sourcePath)
	if sourcePath == "" {
		return "", nil
	}
	if linkID <= 0 {
		return "", fmt.Errorf("invalid link id")
	}
	abs, err := filepath.Abs(sourcePath)
	if err != nil {
		abs = sourcePath
	}
	ext := strings.ToLower(strings.TrimSpace(filepath.Ext(abs)))
	switch ext {
	case ".png", ".jpg", ".jpeg", ".webp", ".gif":
	default:
		ext = ".png"
	}

	dataDir, err := a.portableDataDir()
	if err != nil {
		return "", err
	}
	iconsDir := filepath.Join(dataDir, "icons")
	if err := os.MkdirAll(iconsDir, 0o755); err != nil {
		return "", err
	}

	rel := filepath.ToSlash(filepath.Join("icons", fmt.Sprintf("link-%d%s", linkID, ext)))
	dest := filepath.Join(dataDir, filepath.FromSlash(rel))

	src, err := os.Open(abs)
	if err != nil {
		return "", err
	}
	defer src.Close()

	dst, err := os.Create(dest)
	if err != nil {
		return "", err
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		return "", err
	}
	return rel, nil
}

type Settings struct {
	ThemeFamilyID   string `json:"themeFamilyId,omitempty"`
	ThemeAppearance string `json:"themeAppearance,omitempty"` // "dark" | "light"
}

type ClientDefinition struct {
	Name string `json:"name"`
	IP   string `json:"ip"`
	Type string `json:"type"`
}

// LoadSettingsJSON reads settings.json from the portable data directory, or returns "{}".
func (a *App) LoadSettingsJSON() (string, error) {
	dataDir, err := a.portableDataDir()
	if err != nil {
		return "{}", err
	}
	path := filepath.Join(dataDir, "settings.json")
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return "{}", nil
	}
	if err != nil {
		return "{}", err
	}
	if len(strings.TrimSpace(string(b))) == 0 {
		return "{}", nil
	}

	// Validate it's an object.
	var decoded map[string]any
	if err := json.Unmarshal(b, &decoded); err != nil {
		return "{}", err
	}
	return string(b), nil
}

// SaveSettingsJSON writes settings.json as a JSON object to settings.json.
func (a *App) SaveSettingsJSON(payload string) error {
	var decoded map[string]any
	if err := json.Unmarshal([]byte(payload), &decoded); err != nil {
		return fmt.Errorf("invalid settings json: %w", err)
	}

	dataDir, err := a.portableDataDir()
	if err != nil {
		return err
	}
	path := filepath.Join(dataDir, "settings.json")
	return os.WriteFile(path, []byte(payload), 0o644)
}

// SetLaunchOnWindowsStartup registers or removes game-client.exe (next to this exe) in HKCU\...\Run (Windows only).
func (a *App) SetLaunchOnWindowsStartup(enabled bool) error {
	return setWindowsStartupLaunch(enabled)
}

// GetWindowsStartupStatus returns "" on non-Windows; otherwise "on" or "off" according to the Run registry entry for game-client.exe.
func (a *App) GetWindowsStartupStatus() string {
	return getWindowsStartupStatus()
}

// LoadClientsJSON reads clients.json from the portable data directory, or returns "[]".
func (a *App) LoadClientsJSON() (string, error) {
	dataDir, err := a.portableDataDir()
	if err != nil {
		return "[]", err
	}
	path := filepath.Join(dataDir, "clients.json")
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return "[]", nil
	}
	if err != nil {
		return "[]", err
	}
	if len(strings.TrimSpace(string(b))) == 0 {
		return "[]", nil
	}

	var decoded []ClientDefinition
	if err := json.Unmarshal(b, &decoded); err != nil {
		return "[]", err
	}

	out := make([]ClientDefinition, 0, len(decoded))
	seen := make(map[string]struct{})
	for _, c := range decoded {
		name := strings.TrimSpace(c.Name)
		ip := strings.TrimSpace(c.IP)
		if name == "" || ip == "" {
			continue
		}
		key := strings.ToLower(ip)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		t := strings.ToLower(strings.TrimSpace(c.Type))
		if t != "vip" {
			t = "non-vip"
		}
		out = append(out, ClientDefinition{Name: name, IP: ip, Type: t})
	}

	normalized, err := json.Marshal(out)
	if err != nil {
		return "[]", err
	}
	return string(normalized), nil
}

// SaveClientsJSON writes clients.json as JSON (array) to clients.json.
func (a *App) SaveClientsJSON(payload string) error {
	var decoded []ClientDefinition
	if err := json.Unmarshal([]byte(payload), &decoded); err != nil {
		return fmt.Errorf("invalid clients json: %w", err)
	}

	out := make([]ClientDefinition, 0, len(decoded))
	seen := make(map[string]struct{})
	for _, c := range decoded {
		name := strings.TrimSpace(c.Name)
		ip := strings.TrimSpace(c.IP)
		if name == "" || ip == "" {
			continue
		}
		key := strings.ToLower(ip)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		t := strings.ToLower(strings.TrimSpace(c.Type))
		if t != "vip" {
			t = "non-vip"
		}
		out = append(out, ClientDefinition{Name: name, IP: ip, Type: t})
	}

	dataDir, err := a.portableDataDir()
	if err != nil {
		return err
	}
	path := filepath.Join(dataDir, "clients.json")
	b, err := json.Marshal(out)
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o644)
}

// PickExecutableFile opens a file dialog for an executable.
func (a *App) PickExecutableFile() string {
	opts := runtime.OpenDialogOptions{
		Title: "Select executable",
		Filters: []runtime.FileFilter{
			{DisplayName: "Program / Executable", Pattern: "*.exe;*.EXE;*.app;*.App;*.sh"},
			{DisplayName: "All files", Pattern: "*.*"},
		},
	}
	selection, err := runtime.OpenFileDialog(a.ctx, opts)
	if err != nil || selection == "" {
		return ""
	}
	return selection
}

// PickScriptFile opens a file dialog for BAT/CMD/PowerShell scripts.
// This is used for "run game using script/bat" launcher mode.
func (a *App) PickScriptFile() string {
	opts := runtime.OpenDialogOptions{
		Title: "Select script",
		Filters: []runtime.FileFilter{
			{DisplayName: "Scripts (BAT/CMD/PS1)", Pattern: "*.bat;*.cmd;*.ps1;*.PS1;*.BAT;*.CMD"},
			{DisplayName: "All files", Pattern: "*.*"},
		},
	}
	selection, err := runtime.OpenFileDialog(a.ctx, opts)
	if err != nil || selection == "" {
		return ""
	}
	return selection
}

// PickImageFile opens a file dialog for an image, exe, or icon file.
func (a *App) PickImageFile() string {
	opts := runtime.OpenDialogOptions{
		Title: "Select image, exe, or icon file",
		Filters: []runtime.FileFilter{
			{DisplayName: "Images", Pattern: "*.png;*.jpg;*.jpeg;*.webp;*.gif;*.ico"},
			{DisplayName: "Executables", Pattern: "*.exe;*.bat;*.cmd;*.lnk"},
			{DisplayName: "All files", Pattern: "*.*"},
		},
	}
	selection, err := runtime.OpenFileDialog(a.ctx, opts)
	if err != nil || selection == "" {
		return ""
	}
	return selection
}

// ExtractExecutableIcon extracts an icon from an executable and saves it to data/icons/{hash}.png.
// Returns the path relative to data/ (e.g. "icons/{hash}.png"). It is deterministic per sourcePath.
// It reads the largest RT_ICON frame from PE resources (native resolution / PNG-compressed icons),
// then falls back to PowerShell only if that path fails (e.g. .lnk or unusual binaries).
func (a *App) ExtractExecutableIcon(sourcePath string) (string, error) {
	sourcePath = strings.TrimSpace(sourcePath)
	if sourcePath == "" {
		return "", nil
	}

	abs, err := filepath.Abs(sourcePath)
	if err != nil {
		abs = sourcePath
	}

	// Version suffix invalidates older upscaled 256×256 caches from ExtractAssociatedIcon.
	sum := md5.Sum([]byte(abs + "|rticon:v1"))
	hash := hex.EncodeToString(sum[:])

	dataDir, err := a.portableDataDir()
	if err != nil {
		return "", err
	}

	rel := filepath.ToSlash(filepath.Join("icons", hash+".png"))
	dest := filepath.Join(dataDir, filepath.FromSlash(rel))

	// If we already extracted this icon, reuse it.
	if st, err := os.Stat(dest); err == nil && st.Size() > 0 {
		return rel, nil
	}

	pngBytes, extractErr := extractExeIconPNG(abs)
	if extractErr == nil && len(pngBytes) > 0 {
		if err := os.WriteFile(dest, pngBytes, 0o644); err != nil {
			return "", fmt.Errorf("write icon png: %w", err)
		}
		return rel, nil
	}

	// Fallback: associated icon + upscale (shortcuts and edge cases).
	safePath := strings.ReplaceAll(abs, `'`, `''`)
	safeOut := strings.ReplaceAll(dest, `'`, `''`)

	ps := fmt.Sprintf(`
$ErrorActionPreference = 'Stop';
Add-Type -AssemblyName System.Drawing;
$icon = [System.Drawing.Icon]::ExtractAssociatedIcon('%s');
if ($null -eq $icon) { throw 'ExtractAssociatedIcon returned null'; }
$size = New-Object System.Drawing.Size(256, 256);
$iconScaled = New-Object System.Drawing.Icon($icon, $size);
$bmp = $iconScaled.ToBitmap();
$bmp.Save('%s', [System.Drawing.Imaging.ImageFormat]::Png);
`, safePath, safeOut)

	cmd := exec.Command(
		"powershell",
		"-NoProfile",
		"-ExecutionPolicy",
		"Bypass",
		"-Command",
		ps,
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		if extractErr != nil {
			return "", fmt.Errorf("extract icon failed: %w (pe: %v): %s", err, extractErr, strings.TrimSpace(string(out)))
		}
		return "", fmt.Errorf("extract icon failed: %w: %s", err, strings.TrimSpace(string(out)))
	}

	return rel, nil
}

// ReadImageFileDataURL returns a data: URL for an on-disk image (preview before importing).
func (a *App) ReadImageFileDataURL(absolutePath string) string {
	absolutePath = strings.TrimSpace(absolutePath)
	if absolutePath == "" {
		return ""
	}
	absolutePath = filepath.Clean(absolutePath)
	b, err := os.ReadFile(absolutePath)
	if err != nil {
		return ""
	}
	if len(b) > 15*1024*1024 {
		return ""
	}
	mime := "image/png"
	lower := strings.ToLower(absolutePath)
	switch {
	case strings.HasSuffix(lower, ".jpg"), strings.HasSuffix(lower, ".jpeg"):
		mime = "image/jpeg"
	case strings.HasSuffix(lower, ".webp"):
		mime = "image/webp"
	case strings.HasSuffix(lower, ".gif"):
		mime = "image/gif"
	}
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(b)
}

// ImportCoverImage copies a chosen image into data/covers/{gameID}{ext}. Returns a path relative to data/.
func (a *App) ImportCoverImage(sourcePath string, gameID int) (string, error) {
	if strings.TrimSpace(sourcePath) == "" {
		return "", nil
	}
	dataDir, err := a.portableDataDir()
	if err != nil {
		return "", err
	}
	ext := filepath.Ext(sourcePath)
	if ext == "" {
		ext = ".png"
	}
	rel := filepath.ToSlash(filepath.Join("covers", fmt.Sprintf("%d%s", gameID, ext)))
	dest := filepath.Join(dataDir, filepath.FromSlash(rel))

	src, err := os.Open(sourcePath)
	if err != nil {
		return "", err
	}
	defer src.Close()

	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return "", err
	}

	dst, err := os.Create(dest)
	if err != nil {
		return "", err
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		return "", err
	}
	return rel, nil
}

// ImportPopularImage copies an image into data/popular/{gameID}{ext} for the client "Popular" strip (IGDB screenshot_big).
// Returns a path relative to data/ (e.g. "popular/12.jpg").
func (a *App) ImportPopularImage(sourcePath string, gameID int) (string, error) {
	if strings.TrimSpace(sourcePath) == "" {
		return "", nil
	}
	dataDir, err := a.portableDataDir()
	if err != nil {
		return "", err
	}
	ext := filepath.Ext(sourcePath)
	if ext == "" {
		ext = ".jpg"
	}
	rel := filepath.ToSlash(filepath.Join("popular", fmt.Sprintf("%d%s", gameID, ext)))
	dest := filepath.Join(dataDir, filepath.FromSlash(rel))

	src, err := os.Open(sourcePath)
	if err != nil {
		return "", err
	}
	defer src.Close()

	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return "", err
	}

	dst, err := os.Create(dest)
	if err != nil {
		return "", err
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		return "", err
	}
	return rel, nil
}

// PickPopularJsonFile opens a file dialog to choose popular.json (e.g. on a network share).
func (a *App) PickPopularJsonFile() string {
	opts := runtime.OpenDialogOptions{
		Title: "Select popular.json location",
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON", Pattern: "*.json;*.JSON"},
			{DisplayName: "All files", Pattern: "*.*"},
		},
	}
	selection, err := runtime.OpenFileDialog(a.ctx, opts)
	if err != nil || selection == "" {
		return ""
	}
	return selection
}

// ImportSettingsImage copies a settings asset image into data/settings/ and returns a relative path.
// kind must be "background" or "logo".
func (a *App) ImportSettingsImage(sourcePath string, kind string) (string, error) {
	sourcePath = strings.TrimSpace(sourcePath)
	kind = strings.ToLower(strings.TrimSpace(kind))
	if sourcePath == "" {
		return "", nil
	}
	if kind != "background" && kind != "logo" {
		return "", fmt.Errorf("invalid settings image kind: %s", kind)
	}

	abs, err := filepath.Abs(sourcePath)
	if err != nil {
		abs = sourcePath
	}

	src, err := os.Open(abs)
	if err != nil {
		return "", err
	}
	defer src.Close()

	dataDir, err := a.portableDataDir()
	if err != nil {
		return "", err
	}

	ext := strings.ToLower(strings.TrimSpace(filepath.Ext(abs)))
	switch ext {
	case ".png", ".jpg", ".jpeg", ".webp", ".gif":
	default:
		ext = ".png"
	}

	settingsDir := filepath.Join(dataDir, "settings")
	if err := os.MkdirAll(settingsDir, 0o755); err != nil {
		return "", err
	}

	filename := kind + ext
	rel := filepath.ToSlash(filepath.Join("settings", filename))
	dest := filepath.Join(dataDir, filepath.FromSlash(rel))

	dst, err := os.Create(dest)
	if err != nil {
		return "", err
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		return "", err
	}

	return rel, nil
}

// GetCoverDataURL returns a data: URL for a cover file stored under the portable data directory.
func (a *App) GetCoverDataURL(relPath string) string {
	relPath = strings.TrimSpace(relPath)
	if relPath == "" {
		return ""
	}
	dataDir, err := a.portableDataDir()
	if err != nil {
		return ""
	}
	clean := filepath.Clean(filepath.FromSlash(relPath))
	if strings.HasPrefix(clean, "..") {
		return ""
	}
	full := filepath.Join(dataDir, clean)
	relResolved, err := filepath.Rel(dataDir, full)
	if err != nil || strings.HasPrefix(relResolved, "..") {
		return ""
	}
	b, err := os.ReadFile(full)
	if err != nil {
		return ""
	}

	mime := "image/png"
	lower := strings.ToLower(full)
	switch {
	case strings.HasSuffix(lower, ".jpg"), strings.HasSuffix(lower, ".jpeg"):
		mime = "image/jpeg"
	case strings.HasSuffix(lower, ".webp"):
		mime = "image/webp"
	case strings.HasSuffix(lower, ".gif"):
		mime = "image/gif"
	}
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(b)
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}
