/**
 * OpenFileDialog runs on the Win32 UI thread via Wails `invokeSync`. Invoking it directly from a
 * WebView2 click handler can deadlock; wait one macrotask so the message loop can run first.
 */
export function yieldForNativeFileDialog(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
