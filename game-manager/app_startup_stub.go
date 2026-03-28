//go:build !windows

package main

func setWindowsStartupLaunch(enabled bool) error {
	return nil
}

func getWindowsStartupStatus() string {
	return ""
}
