# 后续版本如何进入插件更新

插件不会执行仓库中任意脚本。它只接受 Releases 最新正式版本附带的签名清单，校验ZIP后调用本机安装队列。

维护者每次发布需要：

1. 在受支持的开发环境更新根 package.json 和 npm lockfile 的版本。采用三个数字，例如0.6.40，并保证高于已安装版本。
2. 完成改动涉及的检查和真实宿主验收；使用现有发布门禁核验，不修改历史通过报告冒充新证据。
3. 执行 `npm run build`、`npm run package:windows`，生成对应版本的Windows ZIP和Setup EXE。
4. 在持有发布私钥的电脑执行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/sign-update.ps1`。私钥位于当前用户 LocalAppData 的 AIQ-Workbench/release-signing/private-key.xml，不提交Git。必须与已安装插件公钥匹配；丢失后不能直接让旧版信任新公钥。
5. 将对应源码提交到公有仓库，为该提交创建 `v版本号` 的正式Release，设为Latest；上传Windows ZIP、Setup EXE、各自.sha256、update.json和update.sig。预发布版本不会通过当前latest入口提供给普通用户。
6. 核对远程资产大小、SHA-256，并用上一版插件执行检查更新。修改ZIP后必须重新签署清单，不得继续使用旧update.json或update.sig。

普通用户在设置页选择GitHub，点击检查更新，再点击安装更新。正常退出Illustrator后安装，重新启动生效。国内镜像模式接受“HTTPS镜像前缀 + 完整GitHub链接”；服务需要支持GitHub Release重定向。签名与包摘要在两种模式下均校验。

当前已验证0.6.39正式helper通过真实GitHub网络读取签名清单；真实CEP按钮到进程联调和各第三方镜像仍应分别验证。不要把静态ZIP上传视为更新功能全部通过。
