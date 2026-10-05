import { CompletionStats } from './TechnicalChecklistPanel'
import { formatMeasurement } from './units'
import { useMemo } from 'react'
import type { Project, Room } from './models'
import Sketch from './Sketch'
import { buildRoomGeometry } from './roomGeometry'
import { roomMetrics, formatMetric } from './metrics'
import { roomChecklist } from './checklist'
import { getCorners, validAngle } from './corners'
import { doorDescription, formatCm, openingNames } from './openings'

const degrees = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
// Comprimentos na unidade escolhida no projeto (Etapa 12); áreas e volume em m²/m³.
const lengthFormatter = (project: Project) => (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? formatMeasurement(value, project.measurementUnit ?? 'm') : '—'
const angleSource = { assumed: 'presumido', informed: 'manual', calculated: 'automático' } as const

interface Entry { room: Room; path: string; floor: string }
function entries(project: Project): Entry[] {
  const out: Entry[] = []
  const visit = (rooms: Room[], path: string, floor: string) => rooms.forEach(room => { const current = `${path} / ${room.displayId ? `${room.displayId} — ` : ''}${room.name || 'Sem nome'}`; out.push({ room, path: current, floor }); visit(room.subrooms, current, floor) })
  project.floors.forEach(floor => visit(floor.rooms, floor.name || 'Sem nome', floor.name || 'Sem nome'))
  return out
}

function RoomReport({ entry, project }: { entry: Entry; project: Project }) {
  const m = lengthFormatter(project)
  const { room } = entry
  const survey = useMemo(() => buildRoomGeometry(room), [room])
  const metrics = roomMetrics(room, survey)
  const status = roomChecklist(room, project, survey)
  const corners = getCorners(room.walls, room.corners)
  const cornerName = (cornerId: string) => { const corner = corners.find(item => item.id === cornerId); return corner ? corner.wallIds.map(wallId => room.walls.find(wall => wall.id === wallId)?.label ?? '?').join('') : '?' }
  const wallName = (wallId: string) => room.walls.find(wall => wall.id === wallId)?.label ?? '?'
  return <article className="report-room">
    <header><p className="breadcrumb">{entry.path}</p><h2>{room.name || 'Sem nome'}</h2><span className={`pill ${status.complete ? 'pill-complete' : ''}`}>{status.complete ? '✓ Completo' : `Em levantamento · ${status.completeness}%`}</span></header>
    <CompletionStats result={status}/><div className="report-grid">
      <Sketch room={room} survey={survey} variant="report"/>
      <div>
        <dl className="report-metrics">
          <div><dt>Pé-direito</dt><dd>{m(room.ceilingHeightM)}</dd></div>
          <div><dt>Área do piso</dt><dd>{metrics.areaApproximate && metrics.floorAreaM2 !== null ? '≈ ' : ''}{formatMetric(metrics.floorAreaM2, 'm²')}</dd></div>
          <div><dt>Perímetro</dt><dd>{m(metrics.perimeterM)}</dd></div>
          <div><dt>Paredes (líquida)</dt><dd>{formatMetric(metrics.netWallAreaM2, 'm²')}</dd></div>
          <div><dt>Volume</dt><dd>{formatMetric(metrics.volumeM3, 'm³')}</dd></div>
        </dl>
        {room.walls.length > 0 && <table><caption>Paredes e cantos</caption><thead><tr><th>Parede</th><th>Comprimento</th><th>Canto</th><th>Ângulo</th></tr></thead><tbody>{room.walls.map((wall, index) => { const corner = survey.perimeter.corners[index]; return <tr key={wall.id}><td>{wall.label}</td><td>{m(wall.lengthM)}</td><td>{corner ? corner.label : '—'}</td><td>{corner && validAngle(corner.angleDegrees) ? `${corner.angleSource === 'calculated' ? '≈ ' : ''}${degrees.format(corner.angleDegrees)}° (${corner.angleSource ? angleSource[corner.angleSource] : '—'})` : 'não definido'}</td></tr> })}</tbody></table>}
      </div>
    </div>
    {room.diagonals.length > 0 && <table><caption>Diagonais</caption><thead><tr><th>Cantos</th><th>Medida</th></tr></thead><tbody>{room.diagonals.map(diagonal => <tr key={diagonal.id}><td>{survey.perimeter.diagonalSegments.find(d=>d.diagonal.id===diagonal.id)?.label??diagonal.cornerIds.map(cornerName).join('–')}</td><td>{m(diagonal.lengthM)}</td></tr>)}</tbody></table>}
    {room.openings.length > 0 && <table><caption>Aberturas</caption><thead><tr><th>ID</th><th>Tipo</th><th>Largura × altura</th><th>Peitoril</th><th>Posição</th><th>Funcionamento</th></tr></thead><tbody>{room.openings.map(opening => <tr key={opening.id}><td>{opening.label}</td><td>{openingNames[opening.type]}</td><td>{formatCm(opening.widthM)} × {formatCm(opening.heightM)} cm</td><td>{opening.type === 'window' ? `${formatCm(opening.sillHeightM)} cm` : '—'}</td><td>Parede {wallName(opening.wallId)}, {m(opening.offsetM)} do canto {cornerName(opening.referenceCornerId)}</td><td>{doorDescription(opening) || '—'}</td></tr>)}</tbody></table>}
    {room.internalWalls.length > 0 && <table><caption>Paredes internas</caption><thead><tr><th>ID</th><th>Comprimento</th><th>Origem</th><th>Orientação</th><th>Observação</th></tr></thead><tbody>{room.internalWalls.map(wall => <tr key={wall.id}><td>{wall.label}</td><td>{m(wall.lengthM)}</td><td>{wall.origin.type === 'perimeter_wall' ? `Parede ${wallName(wall.origin.wallId)}, ${m(wall.origin.distanceM)} do canto ${cornerName(wall.origin.referenceCornerId)}` : '—'}</td><td>{wall.orientationDegrees === null ? '—' : `${degrees.format(wall.orientationDegrees)}°`}</td><td>{wall.note || '—'}</td></tr>)}</tbody></table>}
    {status.issues.length > 0 && <div className="report-issues"><h3>Pendências ({status.issues.length})</h3><ul>{status.issues.map(issue => <li key={issue.id}>{issue.description}{issue.note ? ` — ${issue.note}` : ''}</li>)}</ul></div>}
  </article>
}

// Relatório imprimível do projeto: use "Imprimir / salvar PDF" do navegador.
export default function Report({ project, onClose }: { project: Project; onClose: () => void }) {
  const list = entries(project)
  const generated = new Date().toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })
  const totals = list.reduce((sum, entry) => { if (entry.room.parentRoomId) return sum; const area = roomMetrics(entry.room, buildRoomGeometry(entry.room)).floorAreaM2; return area === null ? { ...sum, missing: sum.missing + 1 } : { ...sum, area: sum.area + area } }, { area: 0, missing: 0 })
  return <div className="report">
    <div className="report-actions"><button onClick={onClose}>← Voltar ao levantamento</button><button className="primary" onClick={() => window.print()}>Imprimir / salvar PDF</button></div>
    <header className="report-cover"><span className="eyebrow">RELATÓRIO DE LEVANTAMENTO ARQUITETÔNICO</span><h1>{project.name || 'Sem nome'}</h1><p className="muted">Gerado em {generated}. Medidas originais em metros; valores derivados (área, volume, ângulos calculados) são indicativos.</p></header>
    {list.length === 0 ? <p>Este projeto ainda não tem ambientes.</p> : <table className="report-index"><caption>Resumo</caption><thead><tr><th>Pavimento / ambiente</th><th>Área</th><th>Perímetro</th><th>Situação</th></tr></thead><tbody>{list.map(entry => { const survey = buildRoomGeometry(entry.room); const metrics = roomMetrics(entry.room, survey); const status = roomChecklist(entry.room, project, survey); return <tr key={entry.room.id}><td>{entry.path}</td><td>{metrics.areaApproximate && metrics.floorAreaM2 !== null ? '≈ ' : ''}{formatMetric(metrics.floorAreaM2, 'm²')}</td><td>{formatMetric(metrics.perimeterM, 'm')}</td><td>{status.complete ? 'Completo' : `${status.completeness}% · ${status.issues.length} pendência(s)`}</td></tr> })}</tbody>
      <tfoot><tr><th>Área total dos ambientes (sem subambientes)</th><th colSpan={3}>{formatMetric(totals.area, 'm²')}{totals.missing ? ` · ${totals.missing} ambiente(s) sem área calculável` : ''}</th></tr></tfoot></table>}
    {list.map(entry => <RoomReport key={entry.room.id} entry={entry} project={project}/>)}
  </div>
}
