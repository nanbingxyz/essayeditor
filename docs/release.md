# Essay 桌面应用发布手册

本文说明如何从私有源码仓库构建 Essay 的 Windows 与 macOS 安装包，并将产物发布到公共仓库 `nanbingxyz/essayeditor-releases`。发布由 [release.yml](../.github/workflows/release.yml) 自动执行。

## 发布架构

```text
私有源码仓库 nanbingxyz/essayeditor
    └── 推送 vX.Y.Z 标签
        └── GitHub Actions
            ├── 验证版本、测试和构建
            ├── Windows x64 / NSIS
            ├── macOS Apple Silicon / App + DMG
            ├── macOS Intel / App + DMG
            └── 公共仓库 nanbingxyz/essayeditor-releases
                ├── latest.json
                ├── 安装包和 updater archive
                └── Tauri updater 签名
```

三个平台任务先共同写入 Draft Release。只有全部构建成功、macOS 签名和公证验证通过，并且 `latest.json` 包含三个平台后，工作流才会把 Draft 发布为 Latest Release。

## 1. 创建公共发布仓库

在 GitHub 创建公共仓库：

- Owner：`nanbingxyz`
- Repository：`essayeditor-releases`
- Visibility：Public
- Default branch：`main`

创建仓库时勾选初始化 README，确保 `main` 分支至少有一个提交。跨仓库创建 Release 标签时，工作流会使用该分支作为 `releaseCommitish`。

该仓库只存放公开安装包和更新清单，不需要复制私有源码。

## 2. 配置跨仓库发布令牌

在 GitHub 的个人设置中创建 Fine-grained personal access token：

1. Resource owner 选择 `nanbingxyz`。
2. Repository access 选择 `Only select repositories`。
3. 只勾选 `essayeditor-releases`。
4. Repository permissions 将 `Contents` 设置为 `Read and write`。
5. 设置合理的过期时间并创建令牌。

进入私有源码仓库的 **Settings → Secrets and variables → Actions → Secrets**，创建名为 `RELEASE_TOKEN` 的 Repository Secret。 

不要使用源码仓库自动提供的 `GITHUB_TOKEN` 代替它。默认 Token 只能写入当前私有仓库，不能向另一个仓库上传 Release。

## 3. 配置 Tauri updater 签名

Tauri updater 签名用于证明更新包由 Essay 发布，与 Apple 代码签名和 Windows Authenticode 是不同机制。

当前 updater 公钥已经写入 `src-tauri/tauri.conf.json`。如果任何带有该公钥的应用版本已经分发，必须继续使用与它配对的现有私钥。重新生成密钥会导致旧客户端无法安装新版本。

如果应用从未分发且还没有 updater 密钥，可以在安全目录生成：

```bash
pnpm tauri signer generate -w /secure/path/essay-updater.key
```

生成后：

1. 将公钥内容写入 `tauri.conf.json` 的 `plugins.updater.pubkey`。
2. 将私钥完整内容保存为 GitHub Secret `TAURI_SIGNING_PRIVATE_KEY`。
3. 将私钥密码保存为 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`；私钥没有密码时可以不创建该 Secret。
4. 将私钥和密码备份到独立的密码库或离线介质，禁止提交到 Git。

## 4. 准备 macOS Developer ID 证书

通过 GitHub Releases 分发的 macOS 应用需要 `Developer ID Application` 证书。不要使用面向 Mac App Store 的 `Apple Distribution` 证书。

1. 登录 Apple Developer，创建 Certificate Signing Request。
2. 在 Certificates, Identifiers & Profiles 中创建 `Developer ID Application` 证书。
3. 下载证书并安装到 macOS login Keychain。
4. 在 Keychain Access 的 **My Certificates** 中展开证书，确认其下包含私钥。
5. 导出证书和私钥为有密码保护的 `.p12` 文件。
6. 转换为单行 Base64：

```bash
openssl base64 -A \
    -in /secure/path/developer-id-application.p12 \
    -out /secure/path/developer-id-application-base64.txt
```

7. 将 Base64 文件的完整内容保存为 `APPLE_CERTIFICATE`。
8. 将导出 `.p12` 时设置的密码保存为 `APPLE_CERTIFICATE_PASSWORD`。

Tauri 会从 `APPLE_CERTIFICATE` 导入证书并推断 signing identity，因此工作流不要求单独配置 `APPLE_SIGNING_IDENTITY`。如果推断失败，可在本机运行以下命令确认身份名称：

```bash
security find-identity -v -p codesigning
```

## 5. 配置 macOS 公证身份

本项目使用 Apple ID 方式公证。Apple 账号必须启用双重认证，并创建 App 专用密码。

需要配置：

- `APPLE_ID`：Apple Developer 账号邮箱。
- `APPLE_PASSWORD`：在 Apple ID 账户页面生成的 App 专用密码，不是 Apple ID 登录密码。
- `APPLE_TEAM_ID`：Apple Developer Membership 页面显示的 Team ID。

Tauri 在 macOS 构建时会自动提交公证。公证失败会使平台任务失败，Release 会继续保持 Draft。

## 6. Actions Secrets 清单

以下值全部配置在私有源码仓库的 Repository Secrets 中：

| Secret | 是否必需 | 说明 |
|---|---:|---|
| `RELEASE_TOKEN` | 是 | 仅允许写入公共 `essayeditor-releases` 仓库的 Fine-grained PAT |
| `TAURI_SIGNING_PRIVATE_KEY` | 是 | 与应用内 updater 公钥配对的私钥完整内容 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 视密钥而定 | updater 私钥密码；私钥无密码时允许缺省 |
| `APPLE_CERTIFICATE` | 是 | `Developer ID Application` `.p12` 文件的单行 Base64 |
| `APPLE_CERTIFICATE_PASSWORD` | 是 | `.p12` 导出密码 |
| `APPLE_ID` | 是 | Apple Developer 账号邮箱 |
| `APPLE_PASSWORD` | 是 | Apple ID App 专用密码 |
| `APPLE_TEAM_ID` | 是 | Apple Developer Team ID |

工作流中的 `GITHUB_TOKEN` 只是 `RELEASE_TOKEN` 的环境变量映射，不需要再创建同名 Secret。

## 7. 发布版本

发布前必须同步修改以下三个版本号，且只使用不带预发布后缀的 SemVer：

- `package.json` 的 `version`
- `src-tauri/Cargo.toml` 的 `[package].version`
- `src-tauri/tauri.conf.json` 的 `version`

例如发布 `0.2.0`：

```bash
pnpm test
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
git commit -m "chore: prepare v0.2.0"
git tag v0.2.0
git push origin main
git push origin v0.2.0
```

工作流只接受严格匹配 `vX.Y.Z` 的标签。`v0.2.0-beta.1`、`nightly` 等标签会在预检阶段失败。

在私有仓库的 Actions 页面查看 `Publish Essay`：

1. `Verify release` 验证版本、测试与构建。
2. 三个 `Build` 任务并行构建并写入公共 Draft Release。
3. `Validate and publish release` 验证更新清单并发布 Release。

不要手动发布构建中的 Draft。最终任务失败时，应先解决失败原因，然后重新运行失败任务。

## 8. 发布结果检查

成功发布后，公共 Release 至少应包含：

- Windows x64 NSIS 安装程序和 `.sig`。
- macOS Apple Silicon DMG、`.app.tar.gz` 和 `.sig`。
- macOS Intel DMG、`.app.tar.gz` 和 `.sig`。
- `latest.json`。

公开更新清单地址为：

```text
https://github.com/nanbingxyz/essayeditor-releases/releases/latest/download/latest.json
```

`latest.json` 应至少包含：

```text
windows-x86_64
darwin-aarch64
darwin-x86_64
```

macOS 构建日志还应显示签名、公证和 stapling 成功。工作流会使用 `codesign`、`spctl` 和 `xcrun stapler validate` 再次检查 `.app`。

## 9. 端到端更新验收

不能只测试新版本的全新安装。正式发布前还应：

1. 安装一个使用相同 updater 公钥签名的旧版本。
2. 发布版本号更高的新版本。
3. 分别在 Windows x64、Apple Silicon Mac 和 Intel Mac 启动旧版本。
4. 确认应用发现更新、展示版本、下载、验证、安装并重启。
5. 确认草稿、设置和本地缓存未丢失。

## 10. 常见问题

### 跨仓库发布返回 403

确认 `RELEASE_TOKEN`：

- 尚未过期或撤销。
- Resource owner 正确。
- 只选择了正确的公共仓库。
- `Contents` 权限为 `Read and write`。
- 如果仓库属于 Organization，Token 已通过组织审批。

### 版本或标签不一致

工作流要求三个版本号与去掉 `v` 前缀后的 tag 完全一致。修正版本并创建一个新标签，不要移动已经公开发布的标签。

### macOS 找不到签名身份

确认 `.p12` 同时包含证书和私钥，而不是只导出了 `.cer`。重新从 Keychain Access 的 **My Certificates** 导出。

### macOS 公证认证失败

确认 `APPLE_PASSWORD` 是 App 专用密码、Apple ID 已启用双重认证，并检查 `APPLE_TEAM_ID` 是否属于该证书对应团队。

### updater 报签名不匹配

确认 `TAURI_SIGNING_PRIVATE_KEY` 与 `tauri.conf.json` 中的公钥配对，且没有在打包后重新压缩或替换 `.app.tar.gz`、NSIS 安装包。

### Release 缺少某个平台

不要手动发布 Draft。查看对应矩阵任务，并确认 macOS 两个 Rust target 都已成功安装和编译。最终任务会在平台不完整时拒绝发布。

### 更新地址返回 404

Draft 和 Prerelease 不会成为 `/releases/latest`。确认最终任务已经将 Release 正式发布，并确认公共仓库名称与 updater endpoint 一致。

### Windows 出现 SmartScreen 警告

本期 Windows 安装包没有 Authenticode 签名，因此可能触发 SmartScreen。Tauri updater 签名只能验证在线更新来源，不能替代 Windows 代码签名。后续配置 Windows 证书时，应保留现有 updater 签名机制。
