import {useState} from 'react'
import type {Project} from './models'
import {createRevitExchange} from './revitExport'
import {downloadText} from './exporting'
export default function RevitExportPanel({project}:{project:Project}) {
 const [floorId,setFloorId]=useState(project.floors[0]?.id??'')
 const [elevation,setElevation]=useState('0')
 const [message,setMessage]=useState('')
 return <details className="ui-disclosure"><summary>Integração Revit (Python / pyRevit)</summary><div>
 <p>Exporta paredes externas e internas posicionadas na Planta Geral. Portas, janelas e vãos serão recortes retangulares; folhas e caixilhos ainda não são criados. Objetos não são modelados.</p>
 <label>Pavimento<select value={floorId} onChange={e=>setFloorId(e.target.value)}>{project.floors.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
 <label>Elevação do pavimento (m)<input value={elevation} onChange={e=>setElevation(e.target.value)} inputMode="decimal"/></label>
 <button onClick={()=>{try {if(!elevation.trim())throw new Error('Informe a elevação.');const data=createRevitExchange(project,floorId,Number(elevation.replace(',','.')));downloadText('LAC-Revit.json',JSON.stringify(data,null,2),'application/json');setMessage(`${data.walls.length} paredes exportadas. ${data.warnings.join(' ')}`)}catch(e){setMessage(e instanceof Error?e.message:'Erro ao exportar.')}}}>Exportar para Revit</button>
 <p>Execute “Importar LAC” na extensão pyRevit disponível na pasta integrations/revit do repositório. Escolha um tipo básico como referência; serão criados tipos LAC com a espessura cadastrada.</p>
 {message&&<p role="status">{message}</p>}
 </div></details>
}
