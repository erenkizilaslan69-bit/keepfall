# Runs the game server under a hard CPU cap (a Windows job object) and measures war-phase load on it with tools/render-probe.mjs. Usage:
#   powershell -ExecutionPolicy Bypass -File tools/capped-run.ps1 -Matches 10 [-CpuPercent 10] [-WarSeconds 90]
# The server is published to a temporary folder (the Production one is not touched) and listens on 5082; its load lines are printed at the end.
param([int]$Matches = 10, [double]$CpuPercent = 10, [int]$WarSeconds = 90, [int]$Port = 5082)
$root = Split-Path -Parent $PSScriptRoot
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class KfJob {
  [StructLayout(LayoutKind.Sequential)] public struct CPU_RATE { public uint ControlFlags; public uint CpuRate; }
  [DllImport("kernel32.dll")] public static extern IntPtr CreateJobObject(IntPtr a, string n);
  [DllImport("kernel32.dll")] public static extern bool SetInformationJobObject(IntPtr j, int c, ref CPU_RATE i, int l);
  [DllImport("kernel32.dll")] public static extern bool AssignProcessToJobObject(IntPtr j, IntPtr p);
  public static bool Cap(IntPtr process, double percent) {
    IntPtr job = CreateJobObject(IntPtr.Zero, null);
    var r = new CPU_RATE { ControlFlags = 0x1 | 0x4, CpuRate = (uint)(percent * 100) }; // enable + hard cap, in 1/100 percent of the whole machine
    return SetInformationJobObject(job, 15, ref r, 8) && AssignProcessToJobObject(job, process);
  }
}
"@
$cores = [Environment]::ProcessorCount
$out = Join-Path $env:TEMP 'kf-cap'
if (-not (Test-Path (Join-Path $out 'Keepfall.Server.dll'))) { dotnet publish "$root\src\Keepfall.Server" -c Release -o $out | Out-Null }
$env:ASPNETCORE_ENVIRONMENT = 'Production'; $env:Keepfall__AllowSpeedControl = 'true'; $env:Keepfall__StatsLogSeconds = '15'
$env:Keepfall__BalancePath = "$root\config\balance.json"; $env:Keepfall__AbandonedRoomMinutes = '1'
$log = Join-Path $env:TEMP 'kf-cap.log'
$p = Start-Process dotnet -ArgumentList "`"$out\Keepfall.Server.dll`"", '--urls', "http://localhost:$Port" -PassThru -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError "$log.err"
Start-Sleep 4
# The rooms get through their preparation at x20 without the cap (it would take minutes); the cap comes on when the last room is in the war, which is what is measured.
$env:WAR = '1'; $env:WARX20 = '15'
$probeOut = Join-Path $env:TEMP 'kf-probe.out'
$probe = Start-Process node -ArgumentList "`"$root/tools/render-probe.mjs`"", "http://localhost:$Port", $Matches, $WarSeconds -PassThru -WindowStyle Hidden -RedirectStandardOutput $probeOut -RedirectStandardError "$probeOut.err"
while (-not (Select-String -Path $probeOut -Pattern 'measuring' -Quiet -ErrorAction SilentlyContinue) -and -not $probe.HasExited) { Start-Sleep 1 }
# the cap is a share of the whole machine: 10% of ONE core = 10/cores percent
$ok = [KfJob]::Cap($p.Handle, $CpuPercent / $cores)
"cap applied when the war began: $ok ($CpuPercent% of one core = $([math]::Round($CpuPercent / $cores, 2))% of $cores cores)"
$probe.WaitForExit()
Get-Content $probeOut | Select-String 'gap|later|reached|did not'
$p.Refresh(); "server: CPU time $([math]::Round($p.TotalProcessorTime.TotalSeconds,1)) s, peak working set $([math]::Round($p.PeakWorkingSet64/1MB)) MB"
Stop-Process -Id $p.Id -Force
Get-Content $log | Select-String "Load:" | Select-Object -Last 8 | ForEach-Object { $_.Line.Trim() }
