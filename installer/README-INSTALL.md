# 效率工作台安装说明

适用 Windows x64、Illustrator 2026，本机实测 **30.0.0**。从 0.6.15 起同时安装 CEP 面板和原生出血读取模块。

## 安装

1. 双击 AIQ-Workbench-0.6.39-Setup.exe。无需选择 Illustrator 目录，安装器从系统注册信息识别主版本 30。
2. Illustrator 运行时显示 queued，并在正常退出后自动安装；不会强制结束软件或保存稿件。
3. 安装完成后重新启动 Illustrator，通过“窗口 → 扩展 → 效率工作台”打开面板。
4. ZIP 为备用安装方式：完整解压后，正常退出 Illustrator，再运行 Install.cmd。

开发协作执行 `npm run deploy:local`；软件运行时后台等待退出。queued 表示尚未安装。

这是未签名开发测试包。安装器将当前用户 HKCU\Software\Adobe\CSXS.12\PlayerDebugMode 设为字符串 1，允许 CEP 12 加载未签名扩展，不修改系统执行策略。此设置影响同一用户的其他 CEP 12 扩展。完整支持范围以版本交付记录为准，没有后台定时读取选区。

## 文件位置、权限与回滚

- 面板：%APPDATA%\Adobe\CEP\extensions\com.aiq.workbench。
- 原生模块：系统注册的 Illustrator 2026 安装目录下 Plug-ins\AIQNative.aip。安装器验证主版本 30；其他小版本尚未实测。需要目录写入权限，权限不足会失败，不跳过模块并宣称完成。
- 备份和原生收据：%LOCALAPPDATA%\AIQ-Workbench。升级只覆盖收据校验通过或与当前包相同的原生模块，不覆盖无法确认归属的同名文件。
- 安装前验证 payload-hashes.json 全部 SHA-256，预备原生文件后才替换面板。原生替换失败会恢复旧面板和原生收据，避免半安装状态。
- 原生模块直接读当前文档出血，无需保存 AI。约百字节数值回包在读取后删除，不复制设计稿。

退出 Illustrator 后双击 Uninstall.cmd，只处理本扩展及路径和哈希均与收据匹配的原生模块，并保留备份。共享 CEP 调试设置不自动恢复，原值保存在 debug-setting-before-install.json。

## 故障排查

- queued：等待 Illustrator 正常退出，不能当作安装完成。
- 原生模块被占用：退出 Illustrator 后重试，不强制杀进程。
- 校验失败：重新完整解压 ZIP，不混放不同版本。
- 提示原生模块不可用：确认完整安装成功并重启 Illustrator，不能只复制 CEP 目录。
- 页面报错：记录恢复提示；哈希一致不等于面板实机验收通过。

不保证其他主版本或 macOS 可用。安装 EXE 尚无 Windows Authenticode 签名；更新清单另外使用项目 RSA 签名，两者不同。

## 在线更新与可选组件

设置页可手动检查 GitHub 新版本，或填写兼容“HTTPS 前缀 + 完整 GitHub URL”的国内镜像前缀。镜像须支持 releases/latest/download 重定向；不内置或保证某个第三方镜像。下载后校验清单 RSA 签名、ZIP 大小和 SHA-256，再交给同一安装队列，正常退出并重启生效。没有后台自动检查或宿主轮询。

安装包包含面板、原生模块、目录选择器和渲染调度程序。Ghostscript/jpegtran 是独立安装的可选组件，不随包分发。没有对应组件时，独立大图渲染及 RGB 转 CMYK TIFF 会明确提示缺少组件，其他原生功能仍可用。组件版本和校验要求见 payload/com.aiq.workbench/bin/raster/runtime-dependencies.json；安装程序从本机受支持的位置查找并验证，不会下载执行来源不明的程序。
