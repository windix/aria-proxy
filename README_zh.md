# Aria2 JSON-RPC 代理 (Proxy)

[English](README.md) | 中文

一个基于 Node.js 的代理服务器，可优雅地拦截 `aria2.addUri` JSON-RPC 请求，将下载链接及其相关的配置参数（如自定义请求头、Cookie 和输出路径）保存到本地的 SQLite 数据库中，而不是直接执行下载任务！

此服务提供了一个完全响应式的 **Vue.js 3** 和 **Tailwind CSS v4** 现代化 Web UI，让您随时监控已捕获的请求，并以一键导出的方式生成标准的 `aria2c -i` 批量下载文本文件。非常适合用于捕获并转发由浏览器扩展程序生成的重型跨站下载请求！

## 特性

- **JSON-RPC 拦截**: 在 `/jsonrpc` 端口进行监听（原生模拟 Aria2 节点），无缝捕获原始链接及其附带的复杂配置参数。
- **RPC 授权保护**: 完全支持标准的 Aria2 RPC Secret 密钥机制！您可以通过配置环境变量来进行严格的密码验证。
- **智能请求头规范化**: 能够穿透严格的 CORS 跨域封锁，精准提取被封装在 JSON 载荷中的 `User-Agent`、`Referer` 和 `Cookie` 值。
- **全局 User-Agent 覆盖**: 提供可选项，以便在导出时强制为所有下载任务应用统一设定的全局 `User-Agent` 规则。
- **现代化可视化仪表盘**: 使用 Vue 3 CDN 动态构建的极具质感的毛玻璃 (Glassmorphism) UI。无需经历繁琐的构建流程，即可享受基于定时器自动刷新的请求监控与参数检查体验。
- **一键批量导出**: 一键将所有尚未处理的请求收集处理，完美映射并输出成严谨的 `aria2c` 多行格式下载输入文件！

## 快速运行

1. **安装依赖包:**
   ```bash
   npm install
   ```

2. **配置环境变量:**
   复制项目中提供的 `.env.example` 为 `.env` 文件，以轻松管理代理环境配置！
   ```bash
   cp .env.example .env
   ```
   *注意: 通过编辑 `.env` 文件，您可以自定义代理运行的端口，通过设定 `ARIA2_RPC_SECRET` 来提供安全的端点鉴权请求保护，或通过定义独立的 `USER_AGENT` 来全局深度覆盖导出的 User-Agent。*

3. **启动代理服务:**
   ```bash
   npm start
   ```

4. **访问控制台仪表盘:**
   打开浏览器，访问下方地址即可进入前端控制 UI：
   - [http://localhost:6800](http://localhost:6800)

5. **对接至您的浏览器扩展:**
   将通常指向 Aria2 原始服务端的常规浏览器下载扩展程序（或用户脚本）配置进行更改，使它们连接至 `http://localhost:6800/jsonrpc`，此代理便可在您的后端安静又安全地静默接管并记录所有请求！

## 架构说明

- `/src/server.js`: 解耦的主 Express 配置入口，负责启动和加载子路由。
- `/src/jsonrpc.js`: 完全独立的、高安全性的 JSON-RPC 协议解析接管和密码凭据验证处理器。
- `/src/api.js`: 为交互式前端 UI 提供驱动控制的标准 RESTful 接口。
- `/src/db.js`: 底层 `better-sqlite3` 数据池控制器件，负责将记录持久化地安全储存进 `/data/` 目录之内。
- `/public/`: 原生、轻快部署的单页面应用仪表盘 (SPA) ，利用了现代化的 Tailwind 前端样式基准构造。

## 输出格式映射

当您通过 UI 原生执行“导出全部 (Export Pending)”指令后，代理应用会生成一份智能适配 Aria2 标准 Input 格式规范的文本内容：

```text
https://secured-remote-site.com/file.7z
  out=my-remote-downloads-folder/my-file_04.7z
  header=User-Agent: Mozilla/5.0...
  header=Cookie: session_id=1234
  header=Referer: https://tracker.com
```

随后，您可以直接将这个导出的文本载荷丢进任意一个真正处于后台运行的终端实例环境内：`aria2c -i aria2_downloads.txt`！
