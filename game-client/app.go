package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

	"golang.org/x/sys/windows"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

func attachConsoleStdio(cmd *exec.Cmd) (cleanup func(), ok bool) {
	// GUI parent processes often have no stdin attached, which can cause
	// `pause` in .bat/.cmd (and interactive scripts) to immediately continue/exit.
	// By wiring console handles explicitly, we ensure interactive input works.
	conIn, errIn := os.OpenFile("CONIN$", os.O_RDWR, 0)
	conOut, errOut := os.OpenFile("CONOUT$", os.O_RDWR, 0)
	if errIn != nil || errOut != nil || conIn == nil || conOut == nil {
		if conIn != nil {
			_ = conIn.Close()
		}
		if conOut != nil {
			_ = conOut.Close()
		}
		return func() {}, false
	}

	cmd.Stdin = conIn
	cmd.Stdout = conOut
	cmd.Stderr = conOut

	return func() {
		_ = conIn.Close()
		_ = conOut.Close()
	}, true
}

// App struct
type App struct {
	ctx             context.Context
	launchStatsFile sync.Mutex
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
func (a *App) domReady(ctx context.Context) {
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

// GetWindowsStartupStatus returns "" on non-Windows; otherwise "on" or "off" for HKCU Run entry EZJRGameClient.
func (a *App) GetWindowsStartupStatus() string {
	return getWindowsStartupStatus()
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

// LoadManagerPopularJSON reads popular.json: either data/popular.json or the path in settings.popularDataPath
// (absolute file path, or directory containing popular.json). Returns "{}" if missing.
func (a *App) LoadManagerPopularJSON() (string, error) {
	settingsRaw, err := a.loadJSONOrDefault("settings.json", "{}")
	if err != nil {
		settingsRaw = "{}"
	}
	var s struct {
		PopularDataPath string `json:"popularDataPath"`
	}
	_ = json.Unmarshal([]byte(settingsRaw), &s)

	path := strings.TrimSpace(s.PopularDataPath)
	if path == "" {
		return a.loadJSONOrDefault("popular.json", "{}")
	}

	if fi, err := os.Stat(path); err == nil && fi.IsDir() {
		path = filepath.Join(path, "popular.json")
	}

	b, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "{}", nil
		}
		return "{}", nil
	}
	if len(strings.TrimSpace(string(b))) == 0 {
		return "{}", nil
	}
	return string(b), nil
}

// resolvePopularDataDir returns the directory that holds popular.json (and launch-stats.json).
func (a *App) resolvePopularDataDir() (string, error) {
	settingsRaw, err := a.loadJSONOrDefault("settings.json", "{}")
	if err != nil {
		settingsRaw = "{}"
	}
	var s struct {
		PopularDataPath string `json:"popularDataPath"`
	}
	_ = json.Unmarshal([]byte(settingsRaw), &s)

	path := strings.TrimSpace(s.PopularDataPath)
	if path == "" {
		return a.managerDataDir()
	}

	if fi, err := os.Stat(path); err == nil && fi.IsDir() {
		return filepath.Clean(path), nil
	}
	return filepath.Clean(filepath.Dir(path)), nil
}

// LoadManagerLaunchStatsJSON reads launch-stats.json next to popular.json (same folder rules as popular data).
// Shape: {"opens":{"12":47}} — integers are how many times each game id was launched from this client.
func (a *App) LoadManagerLaunchStatsJSON() (string, error) {
	dir, err := a.resolvePopularDataDir()
	if err != nil || strings.TrimSpace(dir) == "" {
		return "{}", nil
	}
	p := filepath.Join(dir, "launch-stats.json")
	b, err := os.ReadFile(p)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "{}", nil
		}
		return "{}", nil
	}
	if len(strings.TrimSpace(string(b))) == 0 {
		return "{}", nil
	}
	return string(b), nil
}

// RecordGameLaunch increments the open count for a game id and writes launch-stats.json (same directory as popular data).
func (a *App) RecordGameLaunch(gameID int) error {
	if gameID <= 0 {
		return nil
	}
	a.launchStatsFile.Lock()
	defer a.launchStatsFile.Unlock()

	dir, err := a.resolvePopularDataDir()
	if err != nil || strings.TrimSpace(dir) == "" {
		return nil
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil
	}
	p := filepath.Join(dir, "launch-stats.json")

	type fileShape struct {
		Opens map[string]int64 `json:"opens"`
	}
	var data fileShape
	b, err := os.ReadFile(p)
	if err == nil && len(strings.TrimSpace(string(b))) > 0 {
		_ = json.Unmarshal(b, &data)
	}
	if data.Opens == nil {
		data.Opens = make(map[string]int64)
	}
	key := fmt.Sprintf("%d", gameID)
	data.Opens[key] = data.Opens[key] + 1

	out, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return nil
	}
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, out, 0o644); err != nil {
		return nil
	}
	if err := os.Rename(tmp, p); err != nil {
		return nil
	}
	return nil
}

func (a *App) LoadManagerClientsJSON() (string, error) {
	return a.loadJSONOrDefault("clients.json", "[]")
}

// LoadManagerLinksJSON reads links.json from the shared manager data directory (same as games), or "[]".
func (a *App) LoadManagerLinksJSON() (string, error) {
	return a.loadJSONOrDefault("links.json", "[]")
}

// GetClientIdentityJSON returns {"hostname":"...","ipv4":["..."]} for matching games allowedClientIps to clients.json entries.
func (a *App) GetClientIdentityJSON() string {
	host, _ := os.Hostname()
	host = strings.TrimSpace(host)

	var ips []string
	addrs, err := net.InterfaceAddrs()
	if err == nil {
		seen := map[string]struct{}{}
		for _, addr := range addrs {
			ipnet, ok := addr.(*net.IPNet)
			if !ok || ipnet.IP.IsLoopback() {
				continue
			}
			v4 := ipnet.IP.To4()
			if v4 == nil {
				continue
			}
			s := v4.String()
			if _, dupe := seen[s]; dupe {
				continue
			}
			seen[s] = struct{}{}
			ips = append(ips, s)
		}
	}
	type identity struct {
		Hostname string   `json:"hostname"`
		IPv4     []string `json:"ipv4"`
	}
	b, err := json.Marshal(identity{Hostname: host, IPv4: ips})
	if err != nil {
		return `{"hostname":"","ipv4":[]}`
	}
	return string(b)
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

func (a *App) readManagerImageBytes(relPath string) []byte {
	relPath = strings.TrimSpace(relPath)
	if relPath == "" {
		return nil
	}
	dataDir, err := a.managerDataDir()
	if err != nil {
		return nil
	}
	clean := filepath.Clean(filepath.FromSlash(relPath))
	if strings.HasPrefix(clean, "..") {
		return nil
	}
	full := filepath.Join(dataDir, clean)
	resolved, err := filepath.Rel(dataDir, full)
	if err != nil || strings.HasPrefix(resolved, "..") {
		return nil
	}
	b, err := os.ReadFile(full)
	if err != nil {
		return nil
	}
	return b
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

func (a *App) launchGame(exePath string, args string, waitForExit bool) error {
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

	ext := strings.ToLower(filepath.Ext(exePath))

	// Windows needs special handling for script types.
	var cmd *exec.Cmd
	switch ext {
	case ".bat", ".cmd":
		if waitForExit {
			cmdArgs := append([]string{"/C", exePath}, parts...)
			cmd = exec.Command("cmd.exe", cmdArgs...)
			cmd.Dir = filepath.Dir(exePath)
			cmd.SysProcAttr = &windows.SysProcAttr{
				CreationFlags: windows.CREATE_NEW_CONSOLE,
			}
		} else {
			// Non-blocking mode: match Explorer double-click behavior.
			verb, _ := windows.UTF16PtrFromString("open")
			file, _ := windows.UTF16PtrFromString(exePath)

			var argsPtr *uint16
			if len(parts) > 0 {
				joined := strings.Join(parts, " ")
				argsPtr, _ = windows.UTF16PtrFromString(joined)
			}

			dir, _ := windows.UTF16PtrFromString(filepath.Dir(exePath))

			err := windows.ShellExecute(0, verb, file, argsPtr, dir, windows.SW_SHOW)
			if err != nil {
				return fmt.Errorf("failed to launch bat: %w", err)
			}

			runtime.LogInfo(a.ctx, "launched game: "+exePath)
			return nil
		}
	case ".ps1":
		psArgs := append([]string{"-NoProfile", "-ExecutionPolicy", "Bypass", "-File", exePath}, parts...)
		cmd = exec.Command("powershell.exe", psArgs...)
		cmd.Dir = filepath.Dir(exePath)
		cmd.SysProcAttr = &windows.SysProcAttr{
			CreationFlags: windows.CREATE_NEW_CONSOLE,
		}
	default:
		// Default: treat as an executable.
		cmd = exec.Command(exePath, parts...)
		cmd.Dir = filepath.Dir(exePath)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to launch game: %w", err)
	}
	if waitForExit {
		if err := cmd.Wait(); err != nil {
			return fmt.Errorf("game process exited with error: %w", err)
		}
	}

	runtime.LogInfo(a.ctx, "launched game: "+exePath)
	return nil
}

func (a *App) LaunchGame(exePath string, args string) error {
	return a.launchGame(exePath, args, false)
}

func (a *App) LaunchGameBlocking(exePath string, args string) error {
	return a.launchGame(exePath, args, true)
}

// LaunchGameWithPID launches a game and returns the spawned process ID when available.
// For ShellExecute-launched .bat/.cmd in non-blocking mode, PID cannot be reliably obtained and 0 is returned.
func (a *App) LaunchGameWithPID(exePath string, args string) (int, error) {
	exePath = strings.TrimSpace(exePath)
	if exePath == "" {
		return 0, errors.New("game executable path is empty")
	}

	info, err := os.Stat(exePath)
	if err != nil {
		return 0, fmt.Errorf("unable to access executable: %w", err)
	}
	if info.IsDir() {
		return 0, errors.New("executable path points to a directory")
	}

	parts, err := splitArgs(args)
	if err != nil {
		return 0, err
	}

	ext := strings.ToLower(filepath.Ext(exePath))
	switch ext {
	case ".bat", ".cmd":
		// Non-blocking ShellExecute path doesn't expose PID.
		verb, _ := windows.UTF16PtrFromString("open")
		file, _ := windows.UTF16PtrFromString(exePath)

		var argsPtr *uint16
		if len(parts) > 0 {
			joined := strings.Join(parts, " ")
			argsPtr, _ = windows.UTF16PtrFromString(joined)
		}
		dir, _ := windows.UTF16PtrFromString(filepath.Dir(exePath))
		if err := windows.ShellExecute(0, verb, file, argsPtr, dir, windows.SW_SHOW); err != nil {
			return 0, fmt.Errorf("failed to launch bat: %w", err)
		}
		runtime.LogInfo(a.ctx, "launched game: "+exePath)
		return 0, nil
	}

	// For everything else, use exec.Command and read PID after Start.
	var cmd *exec.Cmd
	switch ext {
	case ".ps1":
		psArgs := append([]string{"-NoProfile", "-ExecutionPolicy", "Bypass", "-File", exePath}, parts...)
		cmd = exec.Command("powershell.exe", psArgs...)
		cmd.Dir = filepath.Dir(exePath)
		cmd.SysProcAttr = &windows.SysProcAttr{
			CreationFlags: windows.CREATE_NEW_CONSOLE,
		}
	default:
		cmd = exec.Command(exePath, parts...)
		cmd.Dir = filepath.Dir(exePath)
	}

	if err := cmd.Start(); err != nil {
		return 0, fmt.Errorf("failed to launch game: %w", err)
	}

	pid := 0
	if cmd.Process != nil {
		pid = cmd.Process.Pid
	}

	runtime.LogInfo(a.ctx, "launched game: "+exePath)
	return pid, nil
}

// IsProcessRunning returns true if a process with given PID appears to be alive.
// On Windows this uses OpenProcess + GetExitCodeProcess.
func (a *App) IsProcessRunning(pid int) bool {
	if pid <= 0 {
		return false
	}
	h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid))
	if err != nil {
		return false
	}
	defer windows.CloseHandle(h)

	var code uint32
	if err := windows.GetExitCodeProcess(h, &code); err != nil {
		return false
	}
	// STILL_ACTIVE == 259
	return code == 259
}

func (a *App) showNativeMessageDialog(title, message, iconRelPath string) {
	title = strings.TrimSpace(title)
	message = strings.TrimSpace(message)
	if title == "" {
		title = "Game Launcher"
	}
	if message == "" {
		message = "Something went wrong."
	}
	var iconBytes []byte
	if iconRelPath != "" {
		iconBytes = a.readManagerImageBytes(iconRelPath)
	}
	// Windows: Wails uses MessageBoxW and ignores opts.Icon; use Task Dialog + HICON instead.
	if len(iconBytes) > 0 && tryWindowsMessageWithIcon(0, title, title, message, iconBytes) {
		return
	}
	opts := runtime.MessageDialogOptions{
		Type:    runtime.InfoDialog,
		Title:   title,
		Message: message,
	}
	if len(iconBytes) > 0 {
		opts.Icon = iconBytes
	}
	_, _ = runtime.MessageDialog(a.ctx, opts)
}

// ShowNativeMessage shows a system dialog (two args; compatible with older embedded frontends).
func (a *App) ShowNativeMessage(title string, message string) {
	a.showNativeMessageDialog(title, message, "")
}

// ShowNativeMessageWithIcon is like ShowNativeMessage but uses a manager-relative image path for the dialog icon when present.
func (a *App) ShowNativeMessageWithIcon(title string, message string, iconRelPath string) {
	a.showNativeMessageDialog(title, message, strings.TrimSpace(iconRelPath))
}
