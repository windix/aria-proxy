# Aria2 Proxy

A Node.js proxy server that intercepts `aria2.addUri` JSON-RPC requests, saving the download URLs and options into a local SQLite database instead of handling the downloads directly.

It provides a modern, premium dark-mode Web UI to view your captured link requests and export them into a standard `aria2` input text file at a later time.

## Features

- **JSON-RPC Interception**: Listens on `/jsonrpc` (the standard Aria2 port) and saves URL, out filename, and custom headers.
- **SQLite Storage**: Very lightweight using `better-sqlite3`.
- **Premium Web Dashboard**: A glassmorphism inspired dashboard.
- **Exporting**: With one click, your pending requests are exported as an `aria2` formatted txt input file ready for your actual aria2 instance to use.
- **Request Management**: Cleanly manage what has been downloaded and clear old requests.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the proxy and Web Dashboard:
   ```bash
   npm start
   ```
   *(Wait, we'll need to define it in package.json, or just run `node server.js`)*
   ```bash
   node server.js
   ```

3. Open your browser and navigate to the dashboard:
   - http://localhost:6800

4. Configure your browser extensions or web scripts that normally point to Aria2. They will connect to `http://localhost:6800/jsonrpc` where this proxy operates and catches their requests.

## How does it export?

When you export, the proxy creates an output in standard Aria2 Input pattern:
```
<URL>
 header=...
 out=...
```
You can feed this file entirely to a real `aria2c` process using `aria2c -i filename.txt`.
