//go:build windows

package main

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"image"
	"image/png"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	kernel32Sys            = windows.NewLazyDLL("kernel32.dll")
	procEnumResourceNamesW = kernel32Sys.NewProc("EnumResourceNamesW")
)

type groupIconEnumCtx struct {
	ids []uint16
}

// extractExeIconPNG loads an executable as a PE image, walks RT_GROUP_ICON /
// RT_ICON resources, picks the largest embedded icon (including raw PNG-in-ICO
// Vista+ frames and native 32 bpp DIB frames), and returns PNG bytes.
func extractExeIconPNG(absExePath string) ([]byte, error) {
	h, err := windows.LoadLibraryEx(absExePath, 0, windows.LOAD_LIBRARY_AS_DATAFILE|windows.LOAD_LIBRARY_AS_IMAGE_RESOURCE)
	if err != nil {
		return nil, fmt.Errorf("LoadLibraryEx: %w", err)
	}
	defer windows.FreeLibrary(h)

	groups, err := enumRTGroupIconIDs(h)
	if err != nil {
		return nil, err
	}

	var best iconCandidate
	for _, gid := range groups {
		resInfo, err := windows.FindResource(h, windows.ResourceID(gid), windows.RT_GROUP_ICON)
		if err != nil {
			continue
		}
		grpData, err := windows.LoadResourceData(h, resInfo)
		if err != nil {
			continue
		}
		grpData = bytes.Clone(grpData)
		for _, c := range parseGroupIconDir(grpData) {
			if c.betterThan(&best) {
				best = c
			}
		}
	}

	if best.id == 0 {
		return nil, fmt.Errorf("no icon resources in executable")
	}

	iconRes, err := windows.FindResource(h, windows.ResourceID(best.id), windows.RT_ICON)
	if err != nil {
		return nil, fmt.Errorf("FindResource RT_ICON: %w", err)
	}
	raw, err := windows.LoadResourceData(h, iconRes)
	if err != nil {
		return nil, fmt.Errorf("LoadResourceData RT_ICON: %w", err)
	}
	raw = bytes.Clone(raw)

	return iconResourceToPNG(raw)
}

func enumRTGroupIconIDs(hModule windows.Handle) ([]uint16, error) {
	var ctx groupIconEnumCtx
	cb := syscall.NewCallback(func(h, typ, name, lparam uintptr) uintptr {
		if name == 0 {
			return 1
		}
		if name>>16 == 0 { // integer resource id
			ctx.ids = append(ctx.ids, uint16(name))
			return 1
		}
		// Named resources are uncommon for icons; ignore.
		return 1
	})

	r, _, _ := procEnumResourceNamesW.Call(
		uintptr(hModule),
		uintptr(windows.RT_GROUP_ICON),
		cb,
		uintptr(unsafe.Pointer(&ctx)),
	)
	if r == 0 {
		if err := windows.GetLastError(); err != nil {
			return nil, fmt.Errorf("EnumResourceNamesW: %w", err)
		}
	}
	return ctx.ids, nil
}

type iconCandidate struct {
	id      uint16
	w, h    int
	bpp     int
	bytesIn uint32
}

func (a iconCandidate) betterThan(b *iconCandidate) bool {
	if b.id == 0 {
		return a.id != 0
	}
	pa := a.w * a.h
	pb := b.w * b.h
	if pa != pb {
		return pa > pb
	}
	if a.bpp != b.bpp {
		return a.bpp > b.bpp
	}
	return a.bytesIn > b.bytesIn
}

func parseGroupIconDir(grpData []byte) []iconCandidate {
	if len(grpData) < 6 {
		return nil
	}
	n := int(binary.LittleEndian.Uint16(grpData[4:6]))
	if n <= 0 || len(grpData) < 6+n*14 {
		return nil
	}
	out := make([]iconCandidate, 0, n)
	for i := 0; i < n; i++ {
		o := 6 + i*14
		e := grpData[o : o+14]
		w := int(e[0])
		if w == 0 {
			w = 256
		}
		h := int(e[1])
		if h == 0 {
			h = 256
		}
		bpp := int(binary.LittleEndian.Uint16(e[6:8]))
		bytesIn := binary.LittleEndian.Uint32(e[8:12])
		id := binary.LittleEndian.Uint16(e[12:14])
		if id == 0 {
			continue
		}
		out = append(out, iconCandidate{id: id, w: w, h: h, bpp: bpp, bytesIn: bytesIn})
	}
	return out
}

var pngSignature = []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}

func iconResourceToPNG(raw []byte) ([]byte, error) {
	if len(raw) >= 8 && bytes.Equal(raw[:8], pngSignature) {
		return raw, nil
	}
	img, err := dibIconToImage(raw)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func dibIconToImage(raw []byte) (image.Image, error) {
	const bihSize = 40
	if len(raw) < bihSize {
		return nil, fmt.Errorf("icon bitmap header too small")
	}
	size := binary.LittleEndian.Uint32(raw[0:4])
	if size < 40 || int(size) > len(raw) {
		return nil, fmt.Errorf("invalid BITMAPINFOHEADER size %d", size)
	}
	w := int(int32(binary.LittleEndian.Uint32(raw[4:8])))
	if w <= 0 || w > 4096 {
		return nil, fmt.Errorf("invalid icon width %d", w)
	}
	totalH := int(int32(binary.LittleEndian.Uint32(raw[8:12])))
	if totalH <= 0 || totalH%2 != 0 {
		return nil, fmt.Errorf("invalid icon DIB height %d", totalH)
	}
	iconH := totalH / 2
	if iconH > 4096 {
		return nil, fmt.Errorf("invalid icon height %d", iconH)
	}
	planes := binary.LittleEndian.Uint16(raw[12:14])
	if planes != 1 {
		return nil, fmt.Errorf("unsupported planes %d", planes)
	}
	bpp := int(binary.LittleEndian.Uint16(raw[14:16]))
	comp := binary.LittleEndian.Uint32(raw[16:20])
	if comp != 0 { // BI_RGB
		return nil, fmt.Errorf("unsupported bitmap compression %d", comp)
	}

	off := int(size)
	var palette [][]uint8 // BGRA quads
	switch bpp {
	case 1, 4, 8:
		nColors := int(binary.LittleEndian.Uint32(raw[32:36]))
		if nColors == 0 {
			nColors = 1 << bpp
		}
		palette = make([][]uint8, nColors)
		for i := 0; i < nColors && off+4 <= len(raw); i++ {
			palette[i] = append([]byte(nil), raw[off:off+4]...)
			off += 4
		}
	case 16, 24, 32:
		// no palette
	default:
		return nil, fmt.Errorf("unsupported bit depth %d", bpp)
	}

	xorStride := ((w*bpp + 31) / 32) * 4
	xorSize := xorStride * iconH
	andStride := ((w + 31) / 32) * 4
	andSize := andStride * iconH
	if off+xorSize+andSize > len(raw) {
		return nil, fmt.Errorf("icon bitmap data truncated")
	}
	xor := raw[off : off+xorSize]
	andMask := raw[off+xorSize : off+xorSize+andSize]

	img := image.NewNRGBA(image.Rect(0, 0, w, iconH))
	switch bpp {
	case 32:
		// Per ICO/PE conventions the monochrome AND mask is ignored for 32 bpp XOR bitmaps.
		copyBGRAToNRGBA(img, xor, w, iconH, xorStride)
	case 24:
		copyBGRToNRGBA(img, xor, w, iconH, xorStride, andMask, andStride)
	case 8:
		copy8bppToNRGBA(img, xor, palette, w, iconH, xorStride, andMask, andStride)
	case 4:
		copy4bppToNRGBA(img, xor, palette, w, iconH, xorStride, andMask, andStride)
	case 1:
		copy1bppToNRGBA(img, xor, palette, w, iconH, xorStride, andMask, andStride)
	default:
		return nil, fmt.Errorf("unsupported XOR bitmap %d bpp", bpp)
	}
	return img, nil
}

func copyBGRAToNRGBA(img *image.NRGBA, xor []byte, w, h, xorStride int) {
	for y := 0; y < h; y++ {
		srcRow := (h - 1 - y) * xorStride
		dstRow := img.PixOffset(0, y)
		for x := 0; x < w; x++ {
			i := srcRow + x*4
			j := dstRow + x*4
			img.Pix[j] = xor[i+2]   // R
			img.Pix[j+1] = xor[i+1] // G
			img.Pix[j+2] = xor[i]   // B
			img.Pix[j+3] = xor[i+3] // A
		}
	}
}

func copyBGRToNRGBA(img *image.NRGBA, xor []byte, w, h, xorStride int, andMask []byte, andStride int) {
	for y := 0; y < h; y++ {
		srcRow := (h - 1 - y) * xorStride
		dstRow := img.PixOffset(0, y)
		for x := 0; x < w; x++ {
			i := srcRow + x*3
			b, g, r := xor[i], xor[i+1], xor[i+2]
			var a byte = 255
			if andPixel(andMask, andStride, w, h, x, y) {
				a = 0
			}
			j := dstRow + x*4
			img.Pix[j] = r
			img.Pix[j+1] = g
			img.Pix[j+2] = b
			img.Pix[j+3] = a
		}
	}
}

func copy8bppToNRGBA(img *image.NRGBA, xor []byte, palette [][]uint8, w, h, xorStride int, andMask []byte, andStride int) {
	for y := 0; y < h; y++ {
		srcRow := (h - 1 - y) * xorStride
		dstRow := img.PixOffset(0, y)
		for x := 0; x < w; x++ {
			idx := xor[srcRow+x]
			var r, g, b, a byte
			if int(idx) < len(palette) {
				q := palette[idx]
				b, g, r, a = q[0], q[1], q[2], q[3]
				if a == 0 {
					a = 255
				}
			}
			if andPixel(andMask, andStride, w, h, x, y) {
				a = 0
			}
			j := dstRow + x*4
			img.Pix[j] = r
			img.Pix[j+1] = g
			img.Pix[j+2] = b
			img.Pix[j+3] = a
		}
	}
}

func copy4bppToNRGBA(img *image.NRGBA, xor []byte, palette [][]uint8, w, h, xorStride int, andMask []byte, andStride int) {
	for y := 0; y < h; y++ {
		srcRow := (h - 1 - y) * xorStride
		dstRow := img.PixOffset(0, y)
		for x := 0; x < w; x++ {
			b := xor[srcRow+x/2]
			var idx byte
			if x%2 == 0 {
				idx = b >> 4
			} else {
				idx = b & 0x0f
			}
			var r, g, bch, a byte
			if int(idx) < len(palette) {
				q := palette[idx]
				bch, g, r, a = q[0], q[1], q[2], q[3]
				if a == 0 {
					a = 255
				}
			}
			if andPixel(andMask, andStride, w, h, x, y) {
				a = 0
			}
			j := dstRow + x*4
			img.Pix[j] = r
			img.Pix[j+1] = g
			img.Pix[j+2] = bch
			img.Pix[j+3] = a
		}
	}
}

func copy1bppToNRGBA(img *image.NRGBA, xor []byte, palette [][]uint8, w, h, xorStride int, andMask []byte, andStride int) {
	for y := 0; y < h; y++ {
		srcRow := (h - 1 - y) * xorStride
		dstRow := img.PixOffset(0, y)
		for x := 0; x < w; x++ {
			byteIdx := x / 8
			bit := 7 - (x % 8)
			idx := (xor[srcRow+byteIdx] >> bit) & 1
			var r, g, bch, a byte
			if int(idx) < len(palette) {
				q := palette[idx]
				bch, g, r, a = q[0], q[1], q[2], q[3]
				if a == 0 {
					a = 255
				}
			}
			if andPixel(andMask, andStride, w, h, x, y) {
				a = 0
			}
			j := dstRow + x*4
			img.Pix[j] = r
			img.Pix[j+1] = g
			img.Pix[j+2] = bch
			img.Pix[j+3] = a
		}
	}
}

// andPixel returns true if the AND mask marks the pixel as fully transparent.
func andPixel(andMask []byte, andStride, w, h, x, y int) bool {
	_ = w
	srcRow := (h - 1 - y) * andStride
	bit := uint(x & 7)
	byteIdx := x >> 3
	v := andMask[srcRow+byteIdx]
	return (v>>(7-bit))&1 != 0
}
