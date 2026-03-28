//go:build windows

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sys/windows/registry"
)

const (
	runValueName       = "EZJRGameClient"
	legacyRunValueName = "EZJRGameManager"
)

func normalizeExePath(p string) (string, error) {
	p = strings.TrimSpace(p)
	if p == "" {
		return "", fmt.Errorf("empty path")
	}
	if len(p) >= 2 && p[0] == '"' && p[len(p)-1] == '"' {
		p = p[1 : len(p)-1]
	}
	if resolved, err := filepath.EvalSymlinks(p); err == nil {
		p = resolved
	}
	return filepath.Abs(p)
}

func pathsEqual(a, b string) bool {
	aa, errA := normalizeExePath(a)
	bb, errB := normalizeExePath(b)
	if errA != nil || errB != nil {
		return false
	}
	return strings.EqualFold(filepath.Clean(aa), filepath.Clean(bb))
}

// gameClientExePath returns <dir_of_game-manager.exe>/game-client.exe (portable layout).
func gameClientExePath() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	exe, err = filepath.Abs(exe)
	if err != nil {
		return "", err
	}
	dir := filepath.Dir(exe)
	client := filepath.Join(dir, "game-client.exe")
	if st, err := os.Stat(client); err != nil || st.IsDir() {
		return "", fmt.Errorf("game-client.exe not found next to %s", filepath.Base(exe))
	}
	return normalizeExePath(client)
}

func setWindowsStartupLaunch(enabled bool) error {
	clientExe, err := gameClientExePath()
	if err != nil {
		return err
	}

	k, err := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Run`, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer k.Close()

	_ = k.DeleteValue(legacyRunValueName)

	if enabled {
		return k.SetStringValue(runValueName, clientExe)
	}
	_ = k.DeleteValue(runValueName)
	return nil
}

func isWindowsStartupRegistered() bool {
	clientExe, err := gameClientExePath()
	if err != nil {
		return false
	}
	k, err := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Run`, registry.READ)
	if err != nil {
		return false
	}
	defer k.Close()

	s, _, err := k.GetStringValue(runValueName)
	if err != nil {
		return false
	}
	return pathsEqual(s, clientExe)
}

func getWindowsStartupStatus() string {
	if !isWindowsStartupRegistered() {
		return "off"
	}
	return "on"
}
