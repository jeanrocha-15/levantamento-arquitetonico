// API de sincronização dos levantamentos (um documento por usuário, com controle de revisão
// e carimbos updatedAt por projeto; a união em conflito é feita pelo cliente).
import express from 'express'
import { pool, query } from './db.mjs'

const MAX_BYTES = 15 * 1024 * 1024
const KEEP_VERSIONS = 50
// Igual a SCHEMA_VERSION de src/storage.ts (5 = checklist técnico).
const MAX_SCHEMA_VERSION = 6

// Validação estrutural mínima; a validação completa do conteúdo é feita pelo cliente (readSnapshot).
function validMeta(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const entries = Object.entries(value)
  return entries.length <= 5000 && entries.every(([id, stamp]) => id.length <= 100 && stamp && typeof stamp === 'object' && typeof stamp.updatedAt === 'string' && stamp.updatedAt.length <= 40 && (stamp.deleted === undefined || stamp.deleted === true))
}
function validSnapshot(value) {
  return value && typeof value === 'object' && Number.isInteger(value.schemaVersion) && value.schemaVersion >= 1 && value.schemaVersion <= MAX_SCHEMA_VERSION && typeof value.revision === 'string' && value.revision.length <= 100
    && typeof value.savedAt === 'string' && value.data && Array.isArray(value.data.projects) && value.data.projects.length > 0
    && value.data.projects.every(project => project && typeof project.id === 'string' && typeof project.name === 'string' && Array.isArray(project.floors))
}

export function workspaceRouter() {
  const router = express.Router()
  router.use(express.text({ type: 'application/json', limit: MAX_BYTES }))

  router.get('/', async (req, res, next) => {
    try {
      const { rows } = await query('SELECT snapshot::text AS snapshot, project_meta::text AS meta FROM workspaces WHERE user_id = $1', [req.user.id])
      if (!rows.length) return res.status(204).end()
      res.type('application/json').send(req.query.with === 'meta' ? `{"meta":${rows[0].meta},"snapshot":${rows[0].snapshot}}` : rows[0].snapshot)
    } catch (error) { next(error) }
  })
  router.get('/head', async (req, res, next) => {
    try {
      const { rows } = await query('SELECT revision, saved_at, updated_at FROM workspaces WHERE user_id = $1', [req.user.id])
      if (!rows.length) return res.status(204).end()
      res.json({ revision: rows[0].revision, savedAt: rows[0].saved_at, updatedAt: rows[0].updated_at })
    } catch (error) { next(error) }
  })
  router.put('/', async (req, res, next) => {
    let body
    try { body = JSON.parse(req.body || '') } catch { return res.status(400).json({ error: 'Conteúdo inválido.' }) }
    const snapshot = body?.snapshot, baseRevision = body?.baseRevision ?? null, resolvesConflict = body?.resolvesConflict === true, meta = body?.meta ?? {}
    if (!validSnapshot(snapshot) || !validMeta(meta) || (baseRevision !== null && typeof baseRevision !== 'string')) return res.status(422).json({ error: 'Levantamento com estrutura inválida; nada foi gravado.' })
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query('SELECT revision, saved_at, snapshot, project_count, project_meta FROM workspaces WHERE user_id = $1 FOR UPDATE', [req.user.id])
      const current = rows[0]
      if (current && current.revision === snapshot.revision) { await client.query('COMMIT'); return res.json({ revision: current.revision, unchanged: true }) }
      if (current && current.revision !== baseRevision) {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: 'O levantamento foi alterado em outro aparelho.', current: current.snapshot, meta: current.project_meta })
      }
      // O autosave envia a cada poucos segundos: guarda no máximo uma versão a cada 10 minutos,
      // mas sempre a versão substituída ao resolver um conflito entre aparelhos.
      const recent = current ? (await client.query("SELECT 1 FROM workspace_versions WHERE user_id = $1 AND archived_at > now() - interval '10 minutes' LIMIT 1", [req.user.id])).rowCount : 0
      if (current && (resolvesConflict || !recent)) {
        await client.query('INSERT INTO workspace_versions (user_id, revision, saved_at, snapshot, project_count, reason) VALUES ($1, $2, $3, $4, $5, $6)',
          [req.user.id, current.revision, current.saved_at, current.snapshot, current.project_count, resolvesConflict ? 'conflito' : 'substituida'])
        await client.query(`DELETE FROM workspace_versions WHERE user_id = $1 AND id NOT IN (SELECT id FROM workspace_versions WHERE user_id = $1 ORDER BY archived_at DESC, id DESC LIMIT ${KEEP_VERSIONS})`, [req.user.id])
      }
      await client.query(`INSERT INTO workspaces (user_id, revision, schema_version, saved_at, snapshot, project_count, project_meta, updated_at)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, now())
        ON CONFLICT (user_id) DO UPDATE SET revision = EXCLUDED.revision, schema_version = EXCLUDED.schema_version, saved_at = EXCLUDED.saved_at, snapshot = EXCLUDED.snapshot, project_count = EXCLUDED.project_count, project_meta = EXCLUDED.project_meta, updated_at = now()`,
      [req.user.id, snapshot.revision, snapshot.schemaVersion, snapshot.savedAt, JSON.stringify(snapshot), snapshot.data.projects.length, JSON.stringify(meta)])
      await client.query('COMMIT')
      res.json({ revision: snapshot.revision })
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); next(error) } finally { client.release() }
  })
  router.get('/versions', async (req, res, next) => {
    try {
      const { rows } = await query('SELECT id, revision, saved_at, project_count, reason, archived_at FROM workspace_versions WHERE user_id = $1 ORDER BY archived_at DESC, id DESC', [req.user.id])
      res.json(rows.map(row => ({ id: String(row.id), revision: row.revision, savedAt: row.saved_at, projects: row.project_count, reason: row.reason, archivedAt: row.archived_at })))
    } catch (error) { next(error) }
  })
  router.get('/versions/:id', async (req, res, next) => {
    try {
      if (!/^\d{1,18}$/.test(req.params.id)) return res.status(404).json({ error: 'Versão não encontrada.' })
      const { rows } = await query('SELECT snapshot::text AS snapshot FROM workspace_versions WHERE user_id = $1 AND id = $2', [req.user.id, req.params.id])
      if (!rows.length) return res.status(404).json({ error: 'Versão não encontrada.' })
      res.type('application/json').send(rows[0].snapshot)
    } catch (error) { next(error) }
  })
  return router
}
