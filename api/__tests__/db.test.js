import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_DB_PATH = path.resolve(__dirname, '..', 'data', 'test-database.sqlite')
const ORIGINAL_DB_PATH = path.resolve(__dirname, '..', 'data', 'database.sqlite')

describe('Database Module', () => {
  let db

  beforeAll(async () => {
    // Backup original DB if exists
    if (fs.existsSync(ORIGINAL_DB_PATH)) {
      fs.copyFileSync(ORIGINAL_DB_PATH, ORIGINAL_DB_PATH + '.bak')
    }
    // Point to test DB
    process.env.DB_PATH = TEST_DB_PATH
  })

  afterAll(() => {
    // Cleanup test DB
    try {
      if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH)
      if (fs.existsSync(ORIGINAL_DB_PATH + '.bak')) {
        fs.copyFileSync(ORIGINAL_DB_PATH + '.bak', ORIGINAL_DB_PATH)
        fs.unlinkSync(ORIGINAL_DB_PATH + '.bak')
      }
    } catch {}
  })

  it('should initialize database successfully', async () => {
    const { initDatabase, isReady } = await import('../database/db.js')
    db = await initDatabase()
    expect(db).toBeDefined()
    expect(isReady()).toBe(true)
  })

  it('should create schema tables', async () => {
    const { queryAll } = await import('../database/db.js')
    const tables = queryAll("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    const tableNames = tables.map(t => t.name).sort()
    expect(tableNames).toContain('users')
    expect(tableNames).toContain('bug_reports')
    expect(tableNames).toContain('surveys')
    expect(tableNames).toContain('survey_responses')
    expect(tableNames).toContain('notifications')
    expect(tableNames).toContain('revoked_tokens')
    expect(tableNames).toContain('audit_logs')
    expect(tableNames).toContain('schema_version')
  })

  it('should execute INSERT and SELECT', async () => {
    const { execute, queryAll, queryOne } = await import('../database/db.js')
    
    const result = execute(
      'INSERT INTO users (id, username, email, password, created_at) VALUES (?, ?, ?, ?, ?)',
      ['test-1', 'testuser', 'test@test.com', 'hashed', new Date().toISOString()]
    )
    expect(result.changes).toBe(1)
    expect(result.lastInsertRowid).toBeDefined()

    const user = queryOne('SELECT * FROM users WHERE id = ?', ['test-1'])
    expect(user).toBeDefined()
    expect(user.username).toBe('testuser')
    expect(user.email).toBe('test@test.com')
  })

  it('should handle transactions', async () => {
    const { transaction, execute, queryAll } = await import('../database/db.js')
    
    transaction(() => {
      execute('INSERT INTO users (id, username, email, password, created_at) VALUES (?, ?, ?, ?, ?)',
        ['test-2', 'user2', 'user2@test.com', 'hash', new Date().toISOString()])
      execute('INSERT INTO users (id, username, email, password, created_at) VALUES (?, ?, ?, ?, ?)',
        ['test-3', 'user3', 'user3@test.com', 'hash', new Date().toISOString()])
    })

    const users = queryAll("SELECT * FROM users WHERE id IN ('test-2', 'test-3')")
    expect(users.length).toBe(2)
  })

  it('should handle rollback on failed transaction', async () => {
    const { transaction, execute, queryAll } = await import('../database/db.js')
    
    expect(() => {
      transaction(() => {
        execute('INSERT INTO users (id, username, email, password, created_at) VALUES (?, ?, ?, ?, ?)',
          ['test-4', 'user4', 'user4@test.com', 'hash', new Date().toISOString()])
        // This should fail - duplicate id
        execute('INSERT INTO users (id, username, email, password, created_at) VALUES (?, ?, ?, ?, ?)',
          ['test-4', 'user4', 'user4@test.com', 'hash', new Date().toISOString()])
      })
    }).toThrow()

    const user = queryAll("SELECT * FROM users WHERE id = 'test-4'")
    expect(user.length).toBe(0)
  })

  it('should get database stats', async () => {
    const { getDBStats } = await import('../database/db.js')
    const stats = getDBStats()
    expect(stats.ready).toBe(true)
    expect(stats.tables).toBeDefined()
    expect(Array.isArray(stats.tables)).toBe(true)
    expect(stats.totalRows).toBeGreaterThan(0)
  })
})