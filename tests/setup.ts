// Inject default test environment variables before server.ts is imported
process.env.NODE_ENV = 'test'
process.env.UI_USERNAME = 'hello'
process.env.UI_PASSWORD = 'world'

// Clear any secrets from .env so tests remain deterministic
process.env.ARIA2_RPC_SECRET = ''
process.env.USER_AGENT = ''
