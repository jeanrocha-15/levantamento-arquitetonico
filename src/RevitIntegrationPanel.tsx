import {useEffect,useRef,useState} from 'react'
import type {Project} from './models'
import RevitExportPanel from './RevitExportPanel'
import {parseRevitReference,referenceStorage} from './revitReference'
import type {RevitReference} from './revitReference'

export default function RevitIntegrationPanel({project}:{project:Project}) {
  const [tab,setTab]=useState('import')
  const [data,setData]=useState<RevitReference>()
  const [busy,setBusy]=useState(true)
  const [message,setMessage]=useState('')
  const input=useRef<HTMLInputElement>(null)
  useEffect(()=>{let active=true
    referenceStorage(project.id).then(async blob=>{if(blob){const parsed=parseRevitReference(await blob.text());if(active)setData(parsed)}}).catch(()=>{if(active)setMessage('Não foi possível carregar a referência local.')}).finally(()=>{if(active)setBusy(false)})
    return ()=>{active=false}
  },[project.id])
  async function read(file:File) {
    setBusy(true);setMessage('')
    try {
      if(file.size>50*1024*1024)throw new Error('Limite de 50 MB. Exporte por pavimento ou use o modo Essencial no pyRevit.')
      const parsed=parseRevitReference(await file.text())
      if(data&&!window.confirm('Substituir a referência Revit salva neste projeto?'))return
      await referenceStorage(project.id,file);setData(parsed);setMessage('Referência salva neste navegador.')
    } catch(error){setMessage(error instanceof Error?error.message:'Não foi possível importar.')}
    finally{setBusy(false);if(input.current)input.current.value=''}
  }
  const rooms=data?.elements.filter(e=>e.kind==='room')??[]
  const valid=rooms.filter(e=>(e.areaM2??0)>0&&Array.isArray(e.boundaryLoops)&&e.boundaryLoops.length>0)
  return <section className="editor"><h2>Integração Revit</h2>
    <nav className="export-actions" aria-label="Fluxo Revit"><button aria-pressed={tab==='import'} onClick={()=>setTab('import')}>Revit → LAC</button><button aria-pressed={tab==='export'} onClick={()=>setTab('export')}>LAC → Revit</button></nav>
    {tab==='export'?<RevitExportPanel project={project}/>:<div>
      <h3>Importar referência do Revit</h3><p>Escolha o JSON gerado pelo botão “Exportar Revit para LAC” no pyRevit.</p>
      <p>O arquivo fica disponível para consulta neste projeto. A conversão para ambientes editáveis e desenho na Planta Geral ainda não está disponível.</p>
      <input ref={input} hidden type="file" accept=".json,application/json" onChange={e=>{const file=e.target.files?.[0];if(file)void read(file)}}/>
      <button className="primary" disabled={busy} onClick={()=>input.current?.click()}>{busy?'Carregando…':'Importar JSON do Revit'}</button>
      {data&&<><h3>{data.source.title}</h3><p>{data.elements.length} registros · {valid.length} ambientes com área e contorno · {rooms.length-valid.length} ambientes sem geometria completa · {data.unplacedRooms?.length??0} não posicionados.</p>
        <details><summary>Ambientes com geometria</summary><ul>{valid.map(room=><li key={room.elementId}>{room.name??room.elementId} — {room.areaM2?.toLocaleString('pt-BR',{maximumFractionDigits:2})} m²</li>)}</ul></details>
        <p className="muted">Referência local independente. O backup do levantamento ainda não inclui este arquivo; mantenha o JSON original.</p></>}
    </div>}{message&&<p role="status">{message}</p>}
  </section>
}
