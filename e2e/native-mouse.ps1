param([int]$StartX, [int]$StartY, [int]$EndX, [int]$EndY, [int]$Steps = 16, [switch]$MoveOnly)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class MarubakoMouse {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
  [StructLayout(LayoutKind.Sequential)] public struct MouseInput {
    public int dx, dy;
    public uint mouseData, flags, time;
    public UIntPtr extra;
  }
  [StructLayout(LayoutKind.Sequential)] public struct Input {
    public uint type;
    public MouseInput mouse;
  }
  [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint count, Input[] input, int size);
  public static void ButtonAt(int x, int y, uint button) {
    int left = GetSystemMetrics(76), top = GetSystemMetrics(77);
    int width = GetSystemMetrics(78), height = GetSystemMetrics(79);
    var input = new Input { type = 0, mouse = new MouseInput {
      dx = (int)Math.Floor((x - left + 0.5) * 65536 / width),
      dy = (int)Math.Floor((y - top + 0.5) * 65536 / height),
      flags = 0x8000 | 0x4000 | 1 | button
    }};
    if (SendInput(1, new[] { input }, Marshal.SizeOf(typeof(Input))) != 1)
      throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
  }
}
'@
[MarubakoMouse]::SetProcessDPIAware() | Out-Null
if ($MoveOnly) {
  [MarubakoMouse]::SetCursorPos($EndX, $EndY) | Out-Null
  exit 0
}
[MarubakoMouse]::SetCursorPos($StartX, $StartY) | Out-Null
Start-Sleep -Milliseconds 80
[MarubakoMouse]::ButtonAt($StartX, $StartY, 2)
try {
  Start-Sleep -Milliseconds 80
  for ($step = 1; $step -le $Steps; $step++) {
    $taskX = [int]($StartX + ($EndX - $StartX) * $step / $Steps)
    $taskY = [int]($StartY + ($EndY - $StartY) * $step / $Steps)
    [MarubakoMouse]::SetCursorPos($taskX, $taskY) | Out-Null
    Start-Sleep -Milliseconds 35
  }
  Start-Sleep -Milliseconds 80
} finally {
  [MarubakoMouse]::ButtonAt($EndX, $EndY, 4)
}
