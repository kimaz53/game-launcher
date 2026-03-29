//go:build !windows

package main

import "fmt"

func extractExeIconPNG(absExePath string) ([]byte, error) {
	return nil, fmt.Errorf("exe icon extraction is only supported on Windows")
}
