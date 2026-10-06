// Worker thread of inputHook.js: owns the low-level keyboard hook.
//
// Why a worker: Windows calls a WH_KEYBOARD_LL hook on the installing
// thread via its message loop, for EVERY key press system-wide - including
// the game's. If that thread is busy (GC, IPC, file I/O on the Electron
// main thread), keyboard input lags everywhere and Windows silently drops
// the hook after LowLevelHooksTimeout. A dedicated thread blocked in
// GetMessageW does nothing else, so the callback runs immediately
// (measured ~30 µs). It only copies the raw fields and posts them on; all
// interpretation happens in inputHook.js on the main thread.
//
// Stop: the main thread posts WM_QUIT to this thread (PostThreadMessageW),
// GetMessageW returns 0, the hook is removed and the worker exits.

"use strict";

const { parentPort, workerData } = require("worker_threads");
const koffi = require(workerData.koffiPath);

const user32 = koffi.load("user32.dll");
const kernel32 = koffi.load("kernel32.dll");

const KBDLLHOOKSTRUCT = koffi.struct("KBDLLHOOKSTRUCT", {
  vkCode: "uint32",
  scanCode: "uint32",
  flags: "uint32",
  time: "uint32",
  dwExtraInfo: "uintptr_t",
});
const MSG = koffi.struct("MSG", {
  hwnd: "void *",
  message: "uint32",
  wParam: "uintptr_t",
  lParam: "intptr_t",
  time: "uint32",
  ptX: "int32",
  ptY: "int32",
  lPrivate: "uint32",
});
const HOOKPROC = koffi.proto(
  "intptr_t __stdcall HOOKPROC(int nCode, uintptr_t wParam, void *lParam)"
);
const SetWindowsHookExW = user32.func(
  "void * __stdcall SetWindowsHookExW(int idHook, HOOKPROC *lpfn, void *hmod, uint32_t dwThreadId)"
);
const CallNextHookEx = user32.func(
  "intptr_t __stdcall CallNextHookEx(void *hhk, int nCode, uintptr_t wParam, void *lParam)"
);
const UnhookWindowsHookEx = user32.func("bool __stdcall UnhookWindowsHookEx(void *hhk)");
const GetMessageW = user32.func(
  "int __stdcall GetMessageW(_Out_ MSG *lpMsg, void *hWnd, uint32_t wMsgFilterMin, uint32_t wMsgFilterMax)"
);
const GetCurrentThreadId = kernel32.func("uint32_t __stdcall GetCurrentThreadId()");
const GetModuleHandleW = kernel32.func("void * __stdcall GetModuleHandleW(const char16_t *name)");

const WH_KEYBOARD_LL = 13;
let hook = null;

const callback = koffi.register((nCode, wParam, lParam) => {
  if (nCode >= 0) {
    const k = koffi.decode(lParam, KBDLLHOOKSTRUCT);
    parentPort.postMessage({
      kind: "key",
      msg: Number(wParam),
      scan: k.scanCode,
      vk: k.vkCode,
      flags: k.flags,
      extraInfo: Number(k.dwExtraInfo),
    });
  }
  // never swallow input - we only listen
  return CallNextHookEx(hook, nCode, wParam, lParam);
}, koffi.pointer(HOOKPROC));

hook = SetWindowsHookExW(WH_KEYBOARD_LL, callback, GetModuleHandleW(null), 0);
parentPort.postMessage({
  kind: "ready",
  threadId: GetCurrentThreadId(),
  ok: Boolean(hook),
});

if (hook) {
  const msg = {};
  // blocks; hook callbacks run inside this call. Only WM_QUIT ends it.
  while (GetMessageW(msg, null, 0, 0) > 0) {
    /* no windows on this thread - nothing to dispatch */
  }
  UnhookWindowsHookEx(hook);
}
koffi.unregister(callback);
