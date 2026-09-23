# 按需原生出血读取（0.6.15）

Windows x64 / Illustrator 2026 30.0.0 已通过真实宿主测试。仅在主动读取出血或显式导出需要文档出血时调用，不轮询、不保存文档、不生成 AI 副本、不切换文档、画板或视图。

## 实现与兼容边界

- 2017 SDK 的 Unicode Suite 8 不适用于本机，原失败记录保留在 `docs/NATIVE-SDK-PROBE-2026-09-16.md`。
- 通过宿主只读接口目录确认提供 Document Suite 21。`generated/AIQDocumentContract.h` 从 SHA-256 固定的 2025 SDK `AIDocument.h` 生成，核对完整 86 个函数指针的顺序，仅开放 `GetDocument` 与 `GetDocumentBleeds`，编译时校验偏移和结构大小。没有把旧结构的版本号改成 21。
- 已核对新版 AIBasicTypes.h：AIReal 为 double，AIRect 顺序为 left/top/right/bottom，出血单位 pt。
- 使用稳定 PICA 接口和 ASCII selector，避开不匹配的 Unicode 实现。严格 32 位十六进制标识对应一个约百字节的临时 JSON 回包，只含协议、状态和四个数字，不是稿件副本。宿主脚本读取后立即删除，C++ 使用 CREATE_NEW 防止覆盖。
- 每次调用申请并释放 Suite，无常驻对象。无文档、接口不可用、解析错误均失败，不冒充零。原生缺失时仅允许只读已保存且无修改 AI 的旧回退，不要求用户保存。
- 已验证普通画布；其他 Illustrator 版本、macOS、大画布未验收。

## 构建

需要 VS 2022 C++ v143、Windows SDK、外置 SDK 头文件。SDK 不随安装包分发。

```powershell
python scripts/generate-native-document-contract.py .research/sdk-candidates/headers2025/AIDocument.h host/native/generated/AIQDocumentContract.h
& scripts/build-native.ps1 -SdkRoot '.research/sdk-candidates/sdk2017/AI_CC_2017_SDK_Win-master'
npm run deploy:local
```

产物为 artifacts/native/AIQNative.aip 和包含源码、契约及二进制哈希的 build.json。打包拒绝过期或诊断构建。默认无日志；诊断宏 AIQ_NATIVE_DIAGNOSTICS 仅供接口目录探测，不进入正式包。

## 已执行验收

`node scripts/test-workbench-v0615.mjs`：三个带修改、从未保存的独立文档，四边不同值、零值、小数值、重复读取、文档切换，24 项检查通过。选区 UUID、文档数、画板矩形和活动画板、缩放及视图中心、修改状态保持；零保存、零副本、零工作文档，回包已清理。

这不替代 CEP 冷启动及鼠标操作验收。安装、证据和剩余能力见 `docs/FIXES-0.6.15.md`。
