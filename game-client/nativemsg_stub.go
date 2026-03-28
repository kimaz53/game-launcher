//go:build !windows

package main

func tryWindowsMessageWithIcon(hwnd uintptr, title, mainInstr, content string, img []byte) bool {
	return false
}
