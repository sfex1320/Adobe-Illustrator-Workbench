using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Windows.Forms;

internal static class Setup {
 [STAThread] static int Main(string[] args) {
  Application.EnableVisualStyles();
  string owned=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"AIQ-Workbench","setup",Guid.NewGuid().ToString("N"));
  try {
   Directory.CreateDirectory(owned);
   string zip=Path.Combine(owned,"package.zip");
   using(Stream input=Assembly.GetExecutingAssembly().GetManifestResourceStream("package.zip"))
   using(Stream output=File.Create(zip)){if(input==null)throw new Exception("安装包资源缺失。");input.CopyTo(output);}
   string expected;using(var r=new StreamReader(Assembly.GetExecutingAssembly().GetManifestResourceStream("package.sha256")))expected=r.ReadToEnd().Split(' ')[0].Trim();
   using(var sha=SHA256.Create())using(var f=File.OpenRead(zip)){string actual=BitConverter.ToString(sha.ComputeHash(f)).Replace("-","").ToLowerInvariant();if(actual!=expected)throw new Exception("安装包校验失败。");}
   string unpack=Path.Combine(owned,"unpacked");
   using(var archive=ZipFile.OpenRead(zip)){long total=0;foreach(var entry in archive.Entries){string target=Path.GetFullPath(Path.Combine(unpack,entry.FullName));if(!target.StartsWith(Path.GetFullPath(unpack)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Exception("安装包路径无效。");total+=entry.Length;if(total>1073741824L)throw new Exception("安装包超出大小限制。");}}
   ZipFile.ExtractToDirectory(zip,unpack);
   string[] dirs=Directory.GetDirectories(unpack);if(dirs.Length!=1)throw new Exception("安装包目录无效。");string package=dirs[0];
   if(args.Length==1&&args[0]=="--verify-only"){if(!File.Exists(Path.Combine(package,"Queue-Install.ps1"))||!File.Exists(Path.Combine(package,"payload-hashes.json")))throw new Exception("安装文件缺失。");File.WriteAllText(Path.Combine(owned,"verified.txt"),expected);return 0;}
   var info=new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"WindowsPowerShell","v1.0","powershell.exe"));
   info.Arguments="-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \""+Path.Combine(package,"Queue-Install.ps1")+"\" -PackageDirectory \""+package+"\"";
   info.UseShellExecute=false;info.CreateNoWindow=true;info.WindowStyle=ProcessWindowStyle.Hidden;info.RedirectStandardOutput=true;info.RedirectStandardError=true;info.StandardOutputEncoding=Encoding.UTF8;info.StandardErrorEncoding=Encoding.UTF8;
   string outputText,errorText;int code;using(var process=Process.Start(info)){outputText=process.StandardOutput.ReadToEnd();errorText=process.StandardError.ReadToEnd();process.WaitForExit();code=process.ExitCode;}
   File.WriteAllText(Path.Combine(owned,"setup.log"),outputText+"\n"+errorText,Encoding.UTF8);
   if(code!=0)throw new Exception("安装未完成。请查看日志：\n"+Path.Combine(owned,"setup.log"));
   string message=outputText.IndexOf("queued",StringComparison.OrdinalIgnoreCase)>=0?"更新已排队，将在 Illustrator 正常退出后安装。\n安装器不会保存或关闭稿件。":"安装流程已完成。重启 Illustrator 后，从“窗口 → 扩展”打开效率工作台。";
   MessageBox.Show(message,"Adobe Illustrator Workbench",MessageBoxButtons.OK,MessageBoxIcon.Information);return 0;
  }catch(Exception error){if(args.Length==1&&args[0]=="--verify-only"){File.WriteAllText(Path.Combine(owned,"failed.txt"),error.ToString());return 1;}MessageBox.Show(error.Message,"Adobe Illustrator Workbench · 安装失败",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}
 }
}
