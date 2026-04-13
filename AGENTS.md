# AI Assistant Project Guidelines

When interacting with this repository, please adhere to the following architecture rules and technical constraints explicitly formed during this project's development.

## 1. Environment & Execution

- **Node Version**: This project strictly targets **Node v22.14.0** for production and CI.
  - ALWAYS consult `.nvmrc` before running Node-based commands.
  - When executing background shell tasks (`npm test`, `npm install`, `npm run build`), initialize NVM first to prevent native binding errors:
    ```bash
    source ~/.nvm/nvm.sh && nvm use
    ```
- **Dev Runtime**: The development server runs on **Bun** via `npm run dev` (`bun src/server.ts`).
  - Bun must be installed separately: `curl -fsSL https://bun.sh/install | bash`
  - Bun is only used for the dev script — **tests and builds still use Node + npm**.
- **Language**: All backend source files are **TypeScript** (`.ts`). Never add new `.js` files under `src/` or `tests/`.

## 2. Frontend Constraints (Vue & Tailwind)

- **Framework**: Use **Vue 3**.
- **Vue Architecture**: **STRICTLY USE COMPOSITION API**. Never use the classic Options API (`data()`, `methods: {}`). Stick entirely to `setup() { ... }`, `ref()`, `computed()`, and native hooks.
- **Styling**: Use **Tailwind CSS v4** via utility classes natively embedded in the HTML templates. Do not write external `.css` files unless absolutely required for `@apply` chaining.
- **Aesthetic**: Maintain the premium Dark Mode glassmorphism styling.
- **No build step**: The frontend (`public/`) is served as static files via CDN-loaded Vue and Tailwind. `public/app.js` remains plain JavaScript — do **not** convert it to TypeScript.

## 3. Backend Constraints (Express & TypeScript)

- **Modularity**: Maintain strict logic decoupling:
  - `src/server.ts` — Express configurator and middleware bootstrap only.
  - `src/jsonrpc.ts` — All JSON-RPC 2.0 protocol parsing, secret verification, and `aria2.addUri` interception logic.
  - `src/api.ts` — All REST endpoints powering the frontend dashboard.
  - `src/db.ts` — Runtime-aware SQLite adapter; initialization lives here exclusively.
  - `src/types.ts` — All shared TypeScript interfaces (`DB`, `RequestRecord`, `Aria2Options`, `JsonRpcPayload`). Add new interfaces here, not inline.
- **Database**: The project uses a **runtime-aware SQLite adapter** in `src/db.ts`:
  - Under **Bun**: uses `bun:sqlite` (built-in, no native addon).
  - Under **Node.js**: uses `better-sqlite3` (native addon).
  - Detection via `process.versions.bun`. Do **not** bypass this adapter or import either driver directly outside `src/db.ts`.
  - The test database uses `:memory:` (set by `NODE_ENV=test`); the production database is at `data/requests.sqlite`.
- **Unit Testing**: Tests use Jest + ts-jest + Supertest and run on Node.js (not Bun). Always write covering cases in `/tests/*.test.ts` when introducing new endpoints. Run tests with:
  ```bash
  source ~/.nvm/nvm.sh && nvm use && npm test
  ```

## 4. TypeScript & Code Quality

- **TypeScript**: Strict mode (`"strict": true`). No `any` without an ESLint suppression comment and a justification.
- **Build**: `npm run build` compiles `src/` → `dist/` via `tsc`. The `tsconfig.test.json` extends the base config and widens `rootDir` for ts-jest.
- **ESLint**: ESLint **v10** with flat config (`eslint.config.mjs`). Uses `typescript-eslint` + `eslint-config-prettier`. Run with `npm run lint`.
- **Prettier**: `semi: false`, `singleQuote: true`, `trailingComma: all`, `printWidth: 100`. Run with `npm run format`. Always format before committing.
- **No semicolons**: The project style is semicolon-free TypeScript. Prettier enforces this.

## 5. Dependencies

- Avoid generic installations. Dependencies are cleanly partitioned:
  - `dependencies` — runtime only (Express, pino, better-sqlite3, cors, dotenv).
  - `devDependencies` — TypeScript, ts-jest, Jest, ESLint, Prettier, type stubs (`@types/*`).
- `better-sqlite3` stays in `dependencies` (needed for the Node.js production runtime).
- `bun:sqlite` is a Bun built-in — do **not** add it as an npm dependency.

## 6. Testing

- When doing bug fix, please add a corresponding unit test to confirm / replicate the issue, then make sure the fix would pass the test.

## 7. Documentation

- **Bilingual Documentation**: Whenever `README.md` is updated, please ensure `README_zh.md` is also symmetrically updated to reflect the changes in Chinese.
