// Resolve each dependency relative to its own source file, including nested modules.
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
const require = createRequire(import.meta.url)
const cache = new Map()
const temporaryRoot = resolve(tmpdir())
const compiledDirectory = mkdtempSync(join(temporaryRoot, 'lac-tests-'))
process.once('exit', () => {
  if (dirname(resolve(compiledDirectory)) === temporaryRoot) rmSync(compiledDirectory, { recursive: true, force: true })
})
function resolveSource(url) {
  if (existsSync(url) && /\.tsx?$/.test(url.pathname)) return url
  for (const extension of ['.ts', '.tsx']) {
    const candidate = new URL(url.href + extension)
    if (existsSync(candidate)) return candidate
  }
  throw new Error(`Módulo de teste inexistente: ${url.pathname}`)
}
export function moduleUrl(name) {
  const file = resolveSource(name instanceof URL ? name : new URL(`../src/${name}`, import.meta.url))
  if (cache.has(file.href)) return cache.get(file.href)
  const compiledFile = join(compiledDirectory, `${cache.size}.mjs`)
  const result = pathToFileURL(compiledFile).href
  cache.set(file.href, result)
  let source = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  source = source.replace(/(from\s*|import\s*)(['"])([^'"]+)\2/g, (_, prefix, quote, dependency) => {
    const target = dependency.startsWith('.')
      ? moduleUrl(new URL(dependency, file))
      : pathToFileURL(require.resolve(dependency)).href
    return prefix + JSON.stringify(target)
  })
  writeFileSync(compiledFile, source, 'utf8')
  return result
}
export const load = name => import(moduleUrl(name))
