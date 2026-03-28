//go:build !windows

package main

func getWindowsStartupStatus() string {
	return ""
}
