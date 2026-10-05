import { useMeasurements } from './Measurement'
import type { buildPerimeter } from './geometry'
import { geometryTolerance } from './tolerances'
const centimeters = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
export default function GeometryStatus({ geometry }: { geometry: ReturnType<typeof buildPerimeter> }) {
  const { format } = useMeasurements()
  if (geometry.segments.length < 3) return null
  const angleWarning = geometry.allAnglesDefined && geometry.orientationMismatch > geometryTolerance.angleDifferenceWarningDegrees
  return <div className="geometry-status" aria-live="polite">
    {(geometry.calculations.length > 0 || !geometry.closed) && <p>Geometria aproximada.</p>}
    {geometry.allMeasured && <p>Diferença de fechamento: {format(geometry.closureM)}.</p>}
    {geometry.allMeasured && (geometry.closureSeverity === 'warning' || angleWarning) && <p className="closure-warning">Verifique as medidas informadas.</p>}
    {angleWarning && <p>Diferença de orientação no último encontro: {centimeters.format(geometry.orientationMismatch)}°.</p>}
    {geometry.allMeasured && !geometry.endpointsMeet && <p>O traçado permanece aberto. O trecho tracejado de fechamento é apenas indicativo.</p>}
    {geometry.solverNotes.map(note=><p className="closure-warning" key={note}>{note}</p>)}
    {geometry.residuals.filter(r=>r.difference>(r.kind==='angle'?.1:.001)).map(r=><p key={r.kind+r.id}> {r.kind==='wall'?`Parede ${geometry.segments.find(s=>s.wall.id===r.id)?.wall.label}`:r.kind==='angle'?'Ângulo':'Diagonal'}: informado {r.kind==='angle'?`${r.measured.toFixed(1)}°`:format(r.measured)} · resultante {r.kind==='angle'?`${r.result.toFixed(1)}°`:format(r.result)} · resíduo {r.kind==='angle'?`${r.difference.toFixed(1)}°`:format(r.difference)}. {r.difference>(r.kind==='angle'?1:geometryTolerance.diagonalDifferenceWarningM)&&'Confira no local.'}</p>)}
    {geometry.closed && <p>Perímetro fechado.</p>}
    {geometry.diagonalSegments.length > 0 && <p>Os valores das diagonais são os medidos; sua representação pode diferir quando houver inconsistências.</p>}
  </div>
}
