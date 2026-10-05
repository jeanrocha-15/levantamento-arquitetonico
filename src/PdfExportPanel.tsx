import PdfCompositionPanel from './PdfCompositionPanel'
import SheetPreviewPanel from './SheetPreviewPanel'
import { defaultSheetLayout } from './pdf/sheetSettings'
import { scopedSheets } from './pdf/scopedSheets'
import { scopedExtent } from './pdf/scopedSheets'
import { exportScopeNames } from './exportScope'
import type { ExportScope } from './exportScope'
import { useState } from 'react'
import type { Floor,Project,Room } from './models'
import { projectRooms } from './relationships'
import { roomExtent } from './pdf/roomSheet'
import { planExtent } from './pdf/planSheet'
import { roofExtent } from './pdf/roofSheet'
import { SHEETS,SCALES,fitMessage,fittingOptions,optionLabel,orientationNames } from './pdf/sheetLayout'
import type { Orientation,SheetOption,SheetSize } from './pdf/sheetLayout'
import { defaultPdfLayers } from './pdf/sheetDecorations'
import type { PdfLayers } from './pdf/sheetDecorations'
export default function PdfExportPanel({project,floor,room,onChangeProject}:{project:Project;floor?:Floor;room?:Room;onChangeProject?:(project:Project)=>void}) {
 const [target,setTarget]=useState<ExportScope|'roof'>('room'),[roomId,setRoomId]=useState(''),[floorId,setFloorId]=useState(''),[roofId,setRoofId]=useState(''),[option,setOption]=useState<SheetOption>({sheet:'A3',orientation:'landscape',scale:50}),[layers,setLayers]=useState(defaultPdfLayers),[suggest,setSuggest]=useState(false),[responsible,setResponsible]=useState<string>(),[message,setMessage]=useState<{type:'ok'|'error';text:string}>()
 const rooms=projectRooms(project),chosenRoom=rooms.find(r=>r.id===(roomId||room?.id))??rooms[0],chosenFloor=project.floors.find(f=>f.id===(floorId||floor?.id))??project.floors[0],roof=project.roofs?.find(r=>r.id===roofId)??project.roofs?.[0]
 const extent=(target==='floor'||target==='project')?scopedExtent(project,target,chosenFloor?.id,chosenRoom?.id,option,layers):target==='room'&&chosenRoom?roomExtent(chosenRoom,layers):target==='plan'&&chosenFloor?planExtent(project,chosenFloor.id,layers):target==='roof'&&roof?roofExtent(project,roof,option):undefined
 const empty=target==='room'?(!chosenRoom?.walls.length?'Cadastre as paredes de um ambiente.':undefined):(target==='floor'||target==='project')?(!extent?'Não há dados para exportar.':undefined):target==='plan'?(!chosenFloor||!project.roomPlacements?.some(p=>p.floorId===chosenFloor.id)?'Insira ambientes na Planta Geral do pavimento.':undefined):(!roof||!(roof.lengthM && roof.lengthM>0 && roof.widthM && roof.widthM>0)?'Cadastre um telhado com comprimento e largura positivos.':undefined)
 const problem=empty??(extent?fitMessage(extent,option)?.replace('O ambiente',target==='plan'?'A Planta Geral':target==='roof'?'A ficha de telhado':'O ambiente'):'Não há dados para exportar.')
 const suggestions=!empty&&extent&&(suggest||problem)?fittingOptions(target==='roof'&&roof?o=>roofExtent(project,roof,o):(target==='floor'||target==='project')?o=>scopedExtent(project,target,chosenFloor?.id,chosenRoom?.id,o,layers)!:extent).slice(0,6):[]
 const [preview,setPreview]=useState(false),[settingsChanged,setSettingsChanged]=useState(false)
 const chooseOption=(next:SheetOption)=>{setOption(next);setSettingsChanged(true)}
 const sources=target==='roof'&&roof?[{kind:'roof' as const,roof}]:target==='roof'?[]:scopedSheets(project,target,chosenFloor?.id,chosenRoom?.id)
 const labels:Record<keyof PdfLayers,string>={walls:'Paredes',ids:'IDs',names:'Nomes',measurements:'Medidas',openings:'Portas/janelas/vãos',objects:'Objetos e móveis',equipment:'Equipamentos',structural:'Vigas/pilares',beams:'Vigas',columns:'Pilares',annotations:'Ângulos/diagonais/anotações'}
 return <div className="pdf-panel"><h4>PDF vetorial em escala real</h4><PdfCompositionPanel project={project} floor={floor} room={room} onChangeProject={onChangeProject}/><details><summary>Exportação rápida por escopo e sugestão de escala</summary><label>Exportar<select value={target} onChange={e=>{setTarget(e.target.value as typeof target);setMessage(undefined);setSuggest(false)}}>{Object.entries(exportScopeNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}<option value="roof">Ficha de telhado</option></select></label>
 {target==='room'&&<label>Ambiente do PDF<select value={chosenRoom?.id??''} onChange={e=>setRoomId(e.target.value)}>{rooms.map(r=><option key={r.id} value={r.id}>{r.displayId} — {r.name}</option>)}</select></label>}
 {(target==='plan'||target==='floor')&&<label>Pavimento do PDF<select value={chosenFloor?.id??''} onChange={e=>setFloorId(e.target.value)}>{project.floors.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}
 {target==='roof'&&<label>Telhado do PDF<select value={roof?.id??''} onChange={e=>setRoofId(e.target.value)}>{project.roofs?.map(r=><option key={r.id} value={r.id}>{r.displayId} — {r.name}</option>)}</select></label>}
 <div className="pdf-options"><label>Folha<select value={option.sheet} onChange={e=>chooseOption({...option,sheet:e.target.value as SheetSize})}>{(Object.keys(SHEETS) as SheetSize[]).map(s=><option key={s} value={s}>{s} ({SHEETS[s].width} × {SHEETS[s].height} mm)</option>)}</select></label><label>Orientação<select value={option.orientation} onChange={e=>chooseOption({...option,orientation:e.target.value as Orientation})}>{(['portrait','landscape'] as const).map(o=><option key={o} value={o}>{orientationNames[o]}</option>)}</select></label><label>Escala<select value={option.scale} onChange={e=>chooseOption({...option,scale:Number(e.target.value)})}>{SCALES.map(s=><option key={s} value={s}>1:{s}</option>)}</select></label></div>
 <label>Responsável no carimbo<input value={responsible??project.generalChecks?.responsible?.value??''} onChange={e=>{setResponsible(e.target.value);setSettingsChanged(true)}} placeholder="Responsável pelo levantamento"/></label>
 {target!=='roof'&&<details className="pdf-layers"><summary>Camadas visuais do PDF</summary>{(Object.keys(labels) as (keyof PdfLayers)[]).map(key=><label key={key}><input type="checkbox" checked={layers[key]} onChange={e=>{setLayers({...layers,[key]:e.target.checked});setSettingsChanged(true)}}/>{labels[key]}</label>)}</details>}
 <button disabled={!!empty||!extent} onClick={()=>setSuggest(true)}>Sugerir folha e escala</button>
 {problem?<p className="pdf-warning" role="alert">⚠ {problem}</p>:<p className="pdf-fit">✓ Cabe em {optionLabel(option)}.</p>}
 {suggestions.length>0&&<><p>Combinações que cabem (clique para aplicar):</p><div className="pdf-suggestions">{suggestions.map(o=><button key={optionLabel(o)} onClick={()=>chooseOption(o)}>{optionLabel(o)}</button>)}</div></>}
 {!empty&&extent&&(suggest||problem)&&!suggestions.length&&<p>Nenhuma folha A4–A0 nas escalas disponíveis comporta o desenho. As medidas serão preservadas; escolha outra escala quando estiver disponível.</p>}
 <p className="muted">A escala escolhida é física. Não há ajuste automático à página. Fotos não entram no desenho.</p><button className="primary" disabled={!!empty} onClick={()=>setPreview(true)}>Abrir prévia de prancha</button>{message&&<p className={message.type==='error'?'export-error':'export-ok'} role={message.type==='error'?'alert':'status'}>{message.text}</p>}{preview&&sources.length>0&&<SheetPreviewPanel project={project} sources={sources} preferInitial={settingsChanged} initial={{...defaultSheetLayout(option),visibleLayers:layers,responsible}} onChangeProject={onChangeProject} onClose={()=>{setPreview(false);setSettingsChanged(false)}}/>}</details></div>
}
