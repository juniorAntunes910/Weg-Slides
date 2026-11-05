# ============================================================
# Slide Studio WEG - ícone nítido na barra de tarefas
# A janela do app é do Edge (--app); o Edge entrega um ícone de 32 px que o Windows reduz para 24 px e borra.
# Quando existe no Menu Iniciar um atalho com o mesmo AppUserModelID da janela, a barra usa o ícone do atalho
# (o .ico tem uma versão de 24 px desenhada à mão). Este script espera a janela abrir, lê o ID dela e cria/atualiza
# o atalho "Slide Studio WEG" no Menu Iniciar (e grava o mesmo ID no atalho da Área de Trabalho, se existir).
# Uso: powershell -File icone-barra.ps1 -Target <exe ou wscript.exe> -Arguments <args> -Icon <ico ou exe> [-WaitSeconds 60]
# ============================================================
param([string]$Target, [string]$Arguments = '', [string]$Icon, [string]$WorkDir = '', [int]$WaitSeconds = 60, [string]$Match = '127\.0\.0\.1_/')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$src = @'
using System; using System.Text; using System.Runtime.InteropServices; using System.Text.RegularExpressions;
public static class SswTaskbar {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr h, ref Guid iid, out IntPtr ps);
  [DllImport("ole32.dll")] static extern int CoCreateInstance(ref Guid clsid, IntPtr outer, uint ctx, ref Guid iid, out IntPtr obj);
  [StructLayout(LayoutKind.Sequential, Pack = 4)] struct PKEY { public Guid fmtid; public uint pid; }
  [StructLayout(LayoutKind.Sequential)] struct PV { public ushort vt; public ushort r1, r2, r3; public IntPtr p; public IntPtr p2; }
  delegate int QIFn(IntPtr self, ref Guid iid, out IntPtr obj);
  delegate int ReleaseFn(IntPtr self);
  delegate int GetValueFn(IntPtr self, ref PKEY k, out PV v);
  delegate int SetValueFn(IntPtr self, ref PKEY k, ref PV v);
  delegate int CommitFn(IntPtr self);
  delegate int LoadFn(IntPtr self, [MarshalAs(UnmanagedType.LPWStr)] string file, uint mode);
  delegate int SaveFn(IntPtr self, [MarshalAs(UnmanagedType.LPWStr)] string file, bool remember);
  static Guid IID_PS = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
  static Guid IID_PF = new Guid("0000010b-0000-0000-C000-000000000046");
  static Guid CLSID_LINK = new Guid("00021401-0000-0000-C000-000000000046");
  static Guid IID_UNK = new Guid("00000000-0000-0000-C000-000000000046");
  static PKEY AUMID = new PKEY { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 };
  static T Fn<T>(IntPtr obj, int slot) { return (T)(object)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(obj), slot * IntPtr.Size), typeof(T)); }
  static string ReadAumid(IntPtr ps) {
    PV v; PKEY k = AUMID; Fn<GetValueFn>(ps, 5)(ps, ref k, out v);
    return v.vt == 31 ? Marshal.PtrToStringUni(v.p) : null;
  }
  /// <summary>AUMID da janela de app do Edge cujo ID combina com a expressão (ex.: o endereço do app)</summary>
  public static string WindowAumid(string pattern) {
    string found = null;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var c = new StringBuilder(64); GetClassName(h, c, 64); if (c.ToString() != "Chrome_WidgetWin_1") return true;
      IntPtr ps; Guid iid = IID_PS;
      if (SHGetPropertyStoreForWindow(h, ref iid, out ps) != 0) return true;
      var id = ReadAumid(ps); Fn<ReleaseFn>(ps, 2)(ps);
      if (id != null && Regex.IsMatch(id, pattern)) { found = id; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  /// <summary>lê ou grava o AppUserModelID de um atalho .lnk existente</summary>
  public static string LinkAumid(string lnk, string set) {
    IntPtr link; Guid cl = CLSID_LINK, unk = IID_UNK;
    int hr = CoCreateInstance(ref cl, IntPtr.Zero, 1, ref unk, out link); if (hr != 0) throw new Exception("ShellLink " + hr);
    IntPtr pf, ps; Guid ipf = IID_PF, ips = IID_PS;
    Fn<QIFn>(link, 0)(link, ref ipf, out pf);
    hr = Fn<LoadFn>(pf, 5)(pf, lnk, 2); if (hr != 0) throw new Exception("Load " + hr);
    Fn<QIFn>(link, 0)(link, ref ips, out ps);
    string cur = ReadAumid(ps);
    if (set != null && set != cur) {
      PV v = new PV { vt = 31, p = Marshal.StringToCoTaskMemUni(set) }; PKEY k = AUMID;
      hr = Fn<SetValueFn>(ps, 6)(ps, ref k, ref v); if (hr != 0) throw new Exception("SetValue " + hr);
      hr = Fn<CommitFn>(ps, 7)(ps); if (hr != 0) throw new Exception("Commit " + hr);
      hr = Fn<SaveFn>(pf, 6)(pf, lnk, true); if (hr != 0) throw new Exception("Save " + hr);
      Marshal.FreeCoTaskMem(v.p); cur = set;
    }
    Fn<ReleaseFn>(ps, 2)(ps); Fn<ReleaseFn>(pf, 2)(pf); Fn<ReleaseFn>(link, 2)(link);
    return cur;
  }
}
'@
Add-Type -TypeDefinition $src

$aumid = $null
$deadline = (Get-Date).AddSeconds($WaitSeconds)
while (-not $aumid -and (Get-Date) -lt $deadline) {
  $aumid = [SswTaskbar]::WindowAumid($Match)
  if (-not $aumid) { Start-Sleep -Milliseconds 700 }
}
if (-not $aumid) { Write-Output 'janela do app não encontrada'; exit 0 }
Write-Output "AUMID da janela: $aumid"

$ws = New-Object -ComObject WScript.Shell
$programs = [Environment]::GetFolderPath('Programs')
if (-not (Test-Path $programs)) { New-Item -ItemType Directory -Force $programs | Out-Null }
$startMenu = Join-Path $programs 'Slide Studio WEG.lnk'
# não sobrescreve um atalho que abre outra coisa (ex.: a versão do PC e o .exe no mesmo computador)
if ((Test-Path $startMenu) -and ($ws.CreateShortcut($startMenu).TargetPath -ne $Target)) { $startMenu = Join-Path $programs 'Slide Studio WEG (app).lnk' }
$s = $ws.CreateShortcut($startMenu)
$s.TargetPath = $Target; $s.Arguments = $Arguments; $s.IconLocation = "$Icon,0"; $s.Description = 'Slide Studio WEG'
if ($WorkDir) { $s.WorkingDirectory = $WorkDir }
$s.Save()
Write-Output ("Menu Iniciar: " + [SswTaskbar]::LinkAumid($startMenu, $aumid))
$desk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Slide Studio WEG.lnk'
if ((Test-Path $desk) -and ($ws.CreateShortcut($desk).TargetPath -eq $Target)) { Write-Output ("Area de Trabalho: " + [SswTaskbar]::LinkAumid($desk, $aumid)) }
