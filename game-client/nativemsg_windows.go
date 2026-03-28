//go:build windows

package main

import (
	"bytes"
	"encoding/binary"
	"os"
	"path/filepath"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Wails' Windows MessageDialog uses MessageBoxW and ignores MessageDialogOptions.Icon.
// TaskDialogIndirect supports a real HICON; we load a temp .ico (PNG wrapped as ICO is valid on Vista+).

const (
	taskDialogConfigPackedSize = 160

	TDF_USE_HICON_MAIN             = 0x00000001
	TDF_ALLOW_DIALOG_CANCELLATION = 0x00000008
	TDCBF_OK_BUTTON                = 0x0001

	IMAGE_ICON      = 1
	LR_LOADFROMFILE = 0x0010
	LR_DEFAULTSIZE  = 0x0040
)

var (
	procTaskDialogIndirect = windows.NewLazySystemDLL("comctl32.dll").NewProc("TaskDialogIndirect")
	procLoadImageW         = windows.NewLazySystemDLL("user32.dll").NewProc("LoadImageW")
	procDestroyIcon        = windows.NewLazySystemDLL("user32.dll").NewProc("DestroyIcon")
)

func putU32(b []byte, off int, v uint32) {
	binary.LittleEndian.PutUint32(b[off:off+4], v)
}

func putU64(b []byte, off int, v uint64) {
	binary.LittleEndian.PutUint64(b[off:off+8], v)
}

func isPNG(b []byte) bool {
	return len(b) >= 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4e && b[3] == 0x47
}

func isICO(b []byte) bool {
	// ICONDIR: reserved 0, type 1 (icon), little-endian
	return len(b) >= 4 && b[0] == 0 && b[1] == 0 && b[2] == 1 && b[3] == 0
}

func pngBytesAsICO(png []byte) []byte {
	// Single PNG image embedded in .ico (supported since Windows Vista).
	var buf bytes.Buffer
	_ = binary.Write(&buf, binary.LittleEndian, uint16(0)) // reserved
	_ = binary.Write(&buf, binary.LittleEndian, uint16(1)) // type: icon
	_ = binary.Write(&buf, binary.LittleEndian, uint16(1)) // count
	_ = binary.Write(&buf, binary.LittleEndian, byte(0))   // width 0 => 256
	_ = binary.Write(&buf, binary.LittleEndian, byte(0))   // height 0 => 256
	_ = binary.Write(&buf, binary.LittleEndian, byte(0))
	_ = binary.Write(&buf, binary.LittleEndian, byte(0))
	_ = binary.Write(&buf, binary.LittleEndian, uint16(1))  // planes
	_ = binary.Write(&buf, binary.LittleEndian, uint16(32)) // bpp
	_ = binary.Write(&buf, binary.LittleEndian, uint32(len(png)))
	_ = binary.Write(&buf, binary.LittleEndian, uint32(6+16))
	_, _ = buf.Write(png)
	return buf.Bytes()
}

func prepareIconFileBytes(raw []byte) ([]byte, bool) {
	if isICO(raw) {
		return raw, true
	}
	if isPNG(raw) {
		return pngBytesAsICO(raw), true
	}
	return nil, false
}

func tryWindowsMessageWithIcon(hwnd uintptr, title, mainInstr, content string, img []byte) bool {
	icoBytes, ok := prepareIconFileBytes(img)
	if !ok || len(icoBytes) == 0 {
		return false
	}

	f, err := os.CreateTemp("", "game-launcher-msg-*.ico")
	if err != nil {
		return false
	}
	tmpPath := f.Name()
	_, werr := f.Write(icoBytes)
	_ = f.Close()
	if werr != nil {
		_ = os.Remove(tmpPath)
		return false
	}
	defer func() { _ = os.Remove(tmpPath) }()

	pathU16, err := windows.UTF16PtrFromString(filepath.Clean(tmpPath))
	if err != nil {
		return false
	}

	r, _, _ := procLoadImageW.Call(0, uintptr(unsafe.Pointer(pathU16)), IMAGE_ICON, 0, 0, LR_LOADFROMFILE|LR_DEFAULTSIZE)
	if r == 0 {
		return false
	}
	hIcon := r
	defer procDestroyIcon.Call(hIcon)

	titlePtr, err := windows.UTF16PtrFromString(title)
	if err != nil {
		return false
	}
	instrPtr, err := windows.UTF16PtrFromString(mainInstr)
	if err != nil {
		return false
	}
	contentPtr, err := windows.UTF16PtrFromString(content)
	if err != nil {
		return false
	}

	var cfg [taskDialogConfigPackedSize]byte
	putU32(cfg[:], 0, taskDialogConfigPackedSize)
	putU64(cfg[:], 4, uint64(hwnd))
	putU64(cfg[:], 12, 0)
	putU32(cfg[:], 20, TDF_USE_HICON_MAIN|TDF_ALLOW_DIALOG_CANCELLATION)
	putU32(cfg[:], 24, TDCBF_OK_BUTTON)
	putU64(cfg[:], 28, uint64(uintptr(unsafe.Pointer(titlePtr))))
	putU64(cfg[:], 36, uint64(hIcon))
	putU64(cfg[:], 44, uint64(uintptr(unsafe.Pointer(instrPtr))))
	putU64(cfg[:], 52, uint64(uintptr(unsafe.Pointer(contentPtr))))
	// remaining fields zero

	var btn int32
	hr, _, _ := procTaskDialogIndirect.Call(
		uintptr(unsafe.Pointer(&cfg[0])),
		uintptr(unsafe.Pointer(&btn)),
		0,
		0,
	)
	return int32(hr) >= 0
}
