# AI Assistant Project Guidelines

When interacting with this repository, please adhere to the following architecture rules and technical constraints explicitly formed during this project's development.

## 1. Environment & Execution
- **Node Environment**: This project strictly utilizes **Node v22.14.0**. 
- ALWAYS consult `.nvmrc`. 
- If you need to execute background shell tasks like unit tests or `npm install`, you MUST securely initialize NVM in your pipeline first (e.g., `source ~/.nvm/nvm.sh && nvm use`) to prevent `better-sqlite3` native binding compile errors inside background virtual shells.

## 2. Frontend Constraints (Vue & Tailwind)
- **Framework**: Use **Vue 3**.
- **Vue Architecture**: **STRICTLY USE COMPOSITION API**. Never use the classic Options API (`data()`, `methods: {}`). Stick entirely to `setup() { ... }`, `ref()`, `computed()`, and native hooks.
- **Styling**: Use **Tailwind CSS v4** via utility classes natively embedded in the HTML templates. Do not formulate external `.css` logic unless it requires absolute `@apply` chaining.
- **Aesthetic**: Stick to the premium Dark Mode glassmorphism styling parameters. 

## 3. Backend Constraints (Express & Node)
- **Modularity**: Maintain strict logic decoupling. `src/server.js` functions solely as the Express configurator. Business logic algorithms are exclusively isolated into `/src/jsonrpc.js` and `/src/api.js`.
- **Database**: We use `better-sqlite3`. Database file is physically hosted at `data/requests.sqlite`. Native initialization happens completely isolated within `src/db.js`.
- **Unit Testing**: Tests utilize Jest alongside Supertest. When introducing new endpoints, always write covering cases inside `/tests/`.

## 4. Dependencies
- Avoid generic installations. Native dependencies are cleanly partitioned directly into `devDependencies` vs standard deployment ones.
