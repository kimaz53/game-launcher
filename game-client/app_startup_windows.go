//go:build windows

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sys/windows/registry"
)

const runValueName = "EZJRGameClient"

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

func currentExecutablePath() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	return normalizeExePath(exe)
}

func isWindowsStartupRegistered() bool {
	self, err := currentExecutablePath()
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
	return pathsEqual(s, self)
}

func getWindowsStartupStatus() string {
	if !isWindowsStartupRegistered() {
		return "off"
	}
	return "on"
}
