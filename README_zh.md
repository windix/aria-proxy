# Aria2 JSON-RPC 代理 (Proxy)

[English](README.md) | 中文

一个代理服务器，可优雅地拦截 `aria2.addUri` JSON-RPC 请求，将下载链接及其完整的配置参数（自定义请求头、Cookie、输出路径等）持久化存储至本地 SQLite 数据库，而非直接执行下载任务。

使用 **TypeScript**、**Express 5** 和 **Bun**（开发运行时）构建。提供基于 **Vue.js 3** 与 **Tailwind CSS v4** 的响应式 Web UI，可随时监控已捕获的请求，并一键导出为标准 `aria2c -i` 批量下载文件。非常适合用于捕获并转发由浏览器扩展程序生成的跨站下载请求。

## 特性

- **JSON-RPC 拦截**: 在 `/jsonrpc` 端点监听（模拟 Aria2 节点），无缝捕获原始链接及其附带的完整配置参数。
- **RPC 授权保护**: 完整支持标准 Aria2 RPC Secret 密钥机制，通过设置 `ARIA2_RPC_SECRET` 环境变量即可强制要求鉴权。
- **智能请求头规范化**: 能够穿透严格的 CORS 跨域限制，精准提取 JSON 载荷中的 `User-Agent`、`Referer` 和 `Cookie`，并在存储前完成去重处理。
- **全局 User-Agent 覆盖**: 通过 `USER_AGENT` 环境变量，可选地为所有导出任务强制应用统一的 `User-Agent`。
- **现代化可视化仪表盘**: 基于 Vue 3 CDN 构建的毛玻璃 (Glassmorphism) 深色 UI，无需任何构建步骤。每 2.5 秒自动刷新，支持逐条展开检查请求头信息。
- **一键批量导出**: 将所有待处理请求一键导出为规范的 `aria2c` 多 URL 输入文件。

## 技术栈

| 层级 | 技术 |
|---|---|
| 开发语言 | TypeScript 6（严格模式，编译为 CommonJS） |
| 运行时（开发） | [Bun](https://bun.sh) — 原生运行 `.ts` 文件，无需额外配置 |
| 运行时（生产） | Node.js 22 — 运行编译后的 `dist/` 产物 |
| 后端框架 | Express 5，pino 日志库 |
| 数据库 | `bun:sqlite`（Bun 环境）/ `better-sqlite3`（Node.js 环境）— 运行时自动检测 |
| 前端 | Vue 3 CDN + Tailwind CSS v4 CDN |
| 测试 | Jest + ts-jest + Supertest |
| 代码检查 | ESLint v10（Flat Config）+ typescript-eslint |
| 代码格式化 | Prettier（`semi: false`，`singleQuote: true`） |

## 快速运行

1. **安装依赖包:**
   ```bash
   npm install
   ```

2. **配置环境变量:**
   ```bash
   cp .env.example .env
   ```
   编辑 `.env` 文件以设置代理端口、RPC 密钥及可选的 User-Agent 覆盖。

3. **启动开发服务器（Bun — 原生运行 TypeScript）:**
   ```bash
   npm run dev
   ```

   或编译后以 Node.js 运行：
   ```bash
   npm run build   # 将 TypeScript 编译至 dist/
   npm start       # 以 Node.js 运行 dist/server.js
   ```

4. **访问控制台仪表盘:**
   [http://localhost:6800](http://localhost:6800)

5. **对接您的浏览器扩展:**
   将浏览器下载扩展或用户脚本中指向 Aria2 的 RPC 端点地址改为：
   ```
   http://localhost:6800/jsonrpc
   ```
   代理将静默拦截所有 `aria2.addUri` 调用并完成存储。

## 环境变量

| 变量名 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `6800` | 代理监听端口 |
| `ARIA2_RPC_SECRET` | *（未设置）* | 设置后，所有 RPC 请求须携带 `token:<secret>` |
| `USER_AGENT` | *（未设置）* | 设置后，强制覆盖所有导出请求的 User-Agent |
| `LOG_LEVEL` | `debug` | Pino 日志级别（`trace` / `debug` / `info` / `warn` / `error`） |

## NPM 脚本

| 脚本 | 说明 |
|---|---|
| `npm run dev` | 以 Bun 启动开发服务器（原生运行 TypeScript） |
| `npm start` | 从编译后的 `dist/` 启动生产服务器 |
| `npm run build` | 通过 `tsc` 将 TypeScript 编译至 `dist/` |
| `npm test` | 运行 Jest 测试套件（Node.js + ts-jest） |
| `npm run lint` | 对 `src/` 和 `tests/` 执行 ESLint v10 检查 |
| `npm run format` | 对所有文件执行 Prettier 格式化 |

## 架构说明

```
src/
├── server.ts      Express 应用配置入口 — 中间件挂载、路由注册、启动入口守卫
├── jsonrpc.ts     JSON-RPC 2.0 处理器 — Secret 鉴权、addUri 拦截、请求头规范化
├── api.ts         驱动前端仪表盘的 REST 接口
├── db.ts          运行时感知 SQLite 适配器（Bun 环境用 bun:sqlite，Node 环境用 better-sqlite3）
├── types.ts       共享 TypeScript 接口定义（DB、RequestRecord、Aria2Options、JsonRpcPayload）
└── bun.d.ts       bun:sqlite 环境声明类型（允许在无 Bun 环境下通过 tsc 编译）

public/
├── index.html     Vue 3 单页应用仪表盘（基于 CDN，无需构建）
└── app.js         Vue Composition API 应用逻辑

tests/
├── api.test.ts      REST API 集成测试
└── jsonrpc.test.ts  JSON-RPC 处理器测试
```

## 导出格式

点击仪表盘中的 **Export Pending** 后，代理会生成符合 `aria2c` 标准的批量输入文件：

```text
https://example.com/file.7z
 out=downloads/file.7z
 header=User-Agent: Mozilla/5.0...
 header=Cookie: session_id=1234
 header=Referer: https://source-site.com
```

可直接将其传入 aria2：

```bash
aria2c -i aria2_downloads.txt
```

## Docker

预构建的多架构镜像（`linux/amd64` 和 `linux/arm64`）会在每次推送到 `main` 分支或发布版本标签时发布到 GitHub Container Registry。

```bash
docker pull ghcr.io/windix/aria-proxy:main
```

**使用 Docker 运行：**

```bash
docker run -d \
  -p 6800:6800 \
  -e ARIA2_RPC_SECRET=your_secret \
  -v $(pwd)/data:/app/data \
  ghcr.io/windix/aria-proxy:main
```

**本地构建（单架构，加载到本地 Docker）：**

```bash
docker buildx build \
  --platform linux/amd64 \
  --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) \
  --build-arg GIT_TAG=$(git describe --tags --exact-match 2>/dev/null || true) \
  -t aria-proxy --load .
```

**本地多架构构建（需推送到镜像仓库）：**

```bash
# 一次性设置：创建支持多架构的 buildx builder
docker buildx create --name multiarch --use
docker buildx inspect --bootstrap

# 构建并推送
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/windix/aria-proxy:latest \
  --push .
```

## 发布版本

使用内置的 `npm version` 命令——它会自动更新 `package.json`、提交、打标签，并通过 `postversion` 钩子一步完成推送（同时触发 CI 中的 Docker 镜像构建）：

```bash
npm version patch   # 1.0.0 → 1.0.1  （修复 bug）
npm version minor   # 1.0.0 → 1.1.0  （新功能）
npm version major   # 1.0.0 → 2.0.0  （破坏性变更）
npm version 1.2.3   # 指定具体版本号
```

如需删除标签并重新发布：

```bash
git tag -d v1.2.3
git push origin --delete v1.2.3
```


## 开发指南

```bash
# 运行测试
npm test

# 仅执行类型检查（不生成产物）
npx tsc --noEmit

# 一步完成检查与格式化
npm run lint && npm run format
```
