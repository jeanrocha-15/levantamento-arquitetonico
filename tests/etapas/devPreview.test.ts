import {it,expect,vi,afterEach} from 'vitest'
afterEach(()=>{vi.unstubAllEnvs();vi.resetModules()})
it.each(['','dev'])('canal %s mantém namespace de projetos e cache separado',async channel=>{
 vi.stubEnv('VITE_APP_CHANNEL',channel);vi.resetModules()
 const release=await import('../../src/releaseChannel'),database=await import('../../src/database'),storage=await import('../../src/storage')
 const prefix=channel==='dev'?'lac-dev-':''
 expect(release.isDevPreview).toBe(channel==='dev');expect(database.DATABASE_NAME).toBe(`${prefix}campo-levantamentos`);expect(storage.JOURNAL_KEY).toBe(`${prefix}campo-autosave-journal-v1`);expect(release.appCachePrefix).toBe(channel==='dev'?'lac-dev-app-':'campo-app-')
})
