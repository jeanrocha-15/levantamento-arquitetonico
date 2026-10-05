import type { AngleCalculation, Corner, Diagonal, Wall } from './models'
import { validAngle } from './corners'
import { geometryTolerance as tolerance } from './tolerances'

export interface DiagonalDiagnostic { id: string; messages: string[]; valid: boolean; calculatedCornerIds: string[] }
const positive = (n: number | null): n is number => n !== null && Number.isFinite(n) && n > 0
const toDegrees = (radians: number) => radians * 180 / Math.PI
function triangleAngle(a: number, b: number, opposite: number) {
  if (!positive(a) || !positive(b) || !positive(opposite) || opposite >= a + b || opposite <= Math.abs(a - b)) return null
  const scale = Math.max(a, b, opposite)
  const x = a / scale, y = b / scale, z = opposite / scale
  return toDegrees(Math.acos(Math.max(-1, Math.min(1, (x * x + y * y - z * z) / (2 * x * y)))))
}
function chainIndices(from: number, to: number, count: number) {
  const result: number[] = []
  for (let index = (from + 1) % count; ; index = (index + 1) % count) {
    result.push(index)
    if (index === to) return result
  }
}

export function resolveDiagonalAngles(walls: Wall[], original: Corner[], diagonals: Diagonal[]) {
  const visualCorners = original.map(corner => ({ ...corner }))
  const calculations: AngleCalculation[] = []
  const diagnostics: DiagonalDiagnostic[] = diagonals.map(diagonal => ({ id: diagonal.id, messages: [], valid: true, calculatedCornerIds: [] }))
  function message(diagnostic: DiagonalDiagnostic, text: string) {
    if (!diagnostic.messages.includes(text)) diagnostic.messages.push(text)
  }
  function propose(index: number, angle: number, diagonal: Diagonal, diagnostic: DiagonalDiagnostic) {
    const corner = visualCorners[index]
    if (corner.angleSource === 'informed') {
      if (!validAngle(corner.angleDegrees) || Math.abs(corner.angleDegrees - angle) > tolerance.angleDifferenceWarningDegrees) message(diagnostic, 'O cálculo difere de um ângulo informado. O valor informado foi preservado; verifique as medidas informadas.')
      return
    }
    const existing = calculations.find(item => item.cornerId === corner.id)
    if (existing) {
      if (Math.abs(existing.angleDegrees - angle) > tolerance.angleDifferenceWarningDegrees) message(diagnostic, 'Diagonais produzem estimativas diferentes para o mesmo canto. Os valores originais permanecem registrados; confira os resíduos da solução geométrica.')
      return
    }
    visualCorners[index] = { ...corner, angleDegrees: angle, angleSource: 'calculated' }
    calculations.push({ cornerId: corner.id, angleDegrees: angle, angleSource: 'calculated', diagonalIds: [diagonal.id], method: 'diagonal' })
    diagnostic.calculatedCornerIds.push(corner.id)
  }

  // Propaga somente soluções trigonométricas determinadas. Não otimiza nem ajusta medidas.
  for (let pass = 0; pass <= walls.length; pass++) {
    const previousCount = calculations.length
    diagonals.forEach((diagonal, diagonalIndex) => {
      const diagnostic = diagnostics[diagonalIndex]
      if(diagonal.checkOnly){message(diagnostic,'Diagonal de conferência: não participa da solução geométrica.');return}
      if(diagonal.vertexIds){return}
      const from = original.findIndex(corner => corner.id === diagonal.cornerIds[0])
      const to = original.findIndex(corner => corner.id === diagonal.cornerIds[1])
      if (from < 0 || to < 0 || from === to) {
        diagnostic.valid = false
        message(diagnostic, 'Selecione dois cantos diferentes do perímetro atual.')
        return
      }
      if (!positive(diagonal.lengthM)) {
        diagnostic.valid = false
        message(diagnostic, 'Informe uma distância positiva para calcular. O registro permanece disponível.')
        return
      }
      const paths = [chainIndices(from, to, walls.length), chainIndices(to, from, walls.length)]
      if (paths.some(path => path.length === 1)) {
        message(diagnostic, 'Os cantos são vizinhos: esta distância corresponde a uma parede e não determina um novo ângulo.')
        return
      }
      const triangles = paths.map(path => {
        if (path.length !== 2) return null
        const a = walls[path[0]].lengthM, b = walls[path[1]].lengthM
        if (!positive(a) || !positive(b)) {
          message(diagnostic, 'Informe os comprimentos das duas paredes do triângulo para calcular o ângulo.')
          return null
        }
        const angle = triangleAngle(a, b, diagonal.lengthM!)
        if (angle === null) {
          message(diagnostic, 'A diagonal e as paredes não formam um triângulo válido. Verifique as medidas informadas.')
          return null
        }
        // A diagonal sozinha não diferencia o canto convexo de sua solução reentrante.
        const originalAngle = original[path[0]].angleDegrees
        const proposedAngle = original[path[0]].angleSource === 'informed' && validAngle(originalAngle) && originalAngle > 180 ? 360 - angle : angle
        propose(path[0], proposedAngle, diagonal, diagnostic)
        message(diagnostic, 'Geometria aproximada. O cálculo usa o ramo convexo do triângulo; ângulos informados têm prioridade.')
        return { atStart: triangleAngle(a, diagonal.lengthM!, b)!, atEnd: triangleAngle(b, diagonal.lengthM!, a)! }
      })
      if (walls.length === 4 && triangles[0] && triangles[1]) {
        // Triângulos em lados opostos da diagonal, considerada interna ao ambiente.
        propose(from, triangles[0].atStart + triangles[1].atEnd, diagonal, diagnostic)
        propose(to, triangles[0].atEnd + triangles[1].atStart, diagonal, diagnostic)
        message(diagnostic, 'Para este quadrilátero, a diagonal é considerada interna e separa dois triângulos.')
      }
      paths.filter(path => path.length > 2).forEach(path => {
        const unknown = path.slice(0, -1).filter(index => !validAngle(visualCorners[index].angleDegrees) || visualCorners[index].angleSource === 'assumed')
        if (unknown.length !== 1 || visualCorners[unknown[0]].angleSource === 'informed' || path.some(index => !positive(walls[index].lengthM))) return
        const target = unknown[0], split = path.indexOf(target) + 1
        function vector(indices: number[]) {
          let x = 0, y = 0, heading = 0
          indices.forEach((index, offset) => {
            if (offset > 0) heading += (180 - visualCorners[indices[offset - 1]].angleDegrees!) * Math.PI / 180
            x += walls[index].lengthM! * Math.cos(heading)
            y += walls[index].lengthM! * Math.sin(heading)
          })
          return { x, y, heading }
        }
        const left = vector(path.slice(0, split)), right = vector(path.slice(split))
        const ux = right.x * Math.cos(left.heading) - right.y * Math.sin(left.heading)
        const uy = right.x * Math.sin(left.heading) + right.y * Math.cos(left.heading)
        const a = left.x * ux + left.y * uy, b = left.y * ux - left.x * uy
        const magnitude = Math.hypot(a, b)
        if (magnitude < tolerance.numericalEpsilon) return
        const ratio = (diagonal.lengthM! ** 2 - left.x ** 2 - left.y ** 2 - ux ** 2 - uy ** 2) / (2 * magnitude)
        if (Math.abs(ratio) > 1 + tolerance.numericalEpsilon) { message(diagnostic, 'A diagonal é incompatível com este trecho de paredes e ângulos. Verifique as medidas informadas.'); return }
        const offset = Math.acos(Math.max(-1, Math.min(1, ratio))), phase = Math.atan2(b, a)
        const candidates = [phase + offset, phase - offset].map(turn => 180 - toDegrees(Math.atan2(Math.sin(turn), Math.cos(turn)))).filter(angle => angle > 0 && angle < 180)
        if (candidates.length !== 1) { message(diagnostic, 'Há mais de uma solução possível. Informe mais ângulos ou outra diagonal para definir este trecho.'); return }
        propose(target, candidates[0], diagonal, diagnostic)
        message(diagnostic, 'Geometria aproximada. Um ângulo foi calculado a partir da diagonal e dos demais ângulos do trecho, usando o ramo convexo.')
      })
    })
    if (calculations.length === previousCount) break
  }
  diagnostics.forEach(diagnostic => {
    if (diagnostic.valid && diagnostic.calculatedCornerIds.length === 0 && diagnostic.messages.length === 0) message(diagnostic, 'Dados insuficientes para calcular novos ângulos. Informe os comprimentos e ângulos intermediários ou outra diagonal.')
  })
  return { visualCorners, calculations, diagnostics }
}
