import type {ReactNode} from 'react'
import {useState} from 'react'
import type {Project,Room} from './models'
import type {CadView} from './CadWorkspace'
import {CadPanelHeader} from './CadWorkspace'
import CadIcon from './CadIcon'
import {InlineName,ItemMenu} from './ItemMenu'
import type {SheetSource} from './pdf/sheetComposer'
import {sheetSourceKey,sheetSourceName} from './pdf/sheetComposer'
import {flattenRooms} from './relationships'

const normalize=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase()
export function browserRoomMatches(room:Room,query:string):boolean {return normalize(`${room.displayId??''} ${room.name}`).includes(normalize(query))||room.subrooms.some(r=>browserRoomMatches(r,query))}
interface Props{
 project:Project;floorId:string;roomId:string;view:CadView;sheets:SheetSource[];issueCount:number
 onOpen:(view:CadView)=>void;onAddFloor:()=>void;onAddRoom:(floorId:string,parent?:string)=>void;onDeleteRoom:(room:Room)=>void
 onDeleteFloor:(id:string)=>void;onDeleteProject:()=>void;onRenameProject:(name:string)=>void;onRenameFloor:(id:string,name:string)=>void
 onRoof:(id:string)=>void;onRevit:(section:string)=>void;onChecklist:()=>void;settings:ReactNode
}
export default function ProjectBrowser({project,floorId,roomId,view,sheets,issueCount,onOpen,onAddFloor,onAddRoom,onDeleteRoom,onDeleteFloor,onDeleteProject,onRenameProject,onRenameFloor,onRoof,onRevit,onChecklist,settings}:Props){
 const [search,setSearch]=useState(''),[renaming,setRenaming]=useState<string>()
 const roomRows=(rooms:Room[],floor:string,nested=false)=><ul className="cad-browser-rooms">{rooms.filter(r=>browserRoomMatches(r,search)).map(r=><li key={r.id}><div className="cad-browser-row"><button className={view.kind==='room'&&roomId===r.id?'selected':''} title={`${r.displayId??''} — ${r.name}`} onClick={()=>onOpen({kind:'room',key:'room:'+r.id,floorId:floor,roomId:r.id,name:r.name})}><CadIcon name="room"/><span>{r.name||'Sem nome'}</span></button><ItemMenu label={r.name||'Ambiente sem nome'} actions={[{label:'Adicionar subambiente',onSelect:()=>onAddRoom(floor,r.id)},{label:'Excluir',danger:true,onSelect:()=>onDeleteRoom(r)}]}/></div>{nested&&r.subrooms.length>0&&roomRows(r.subrooms,floor,true)}</li>)}</ul>
 const incompatible=project.bim?.elements.filter(e=>!!e.issue||e.editable===false).length??0
 const conflicts=project.bim?.warnings.filter(w=>/conflito/i.test(w)).length??0
 return <nav id="project-navigation" className="sidebar cad-project-browser" aria-label="Organização do levantamento"><CadPanelHeader panel="browser"/><label className="cad-browser-search"><CadIcon name="search"/><input aria-label="Buscar no projeto" placeholder="Buscar no projeto…" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button aria-label="Limpar busca" onClick={()=>setSearch('')}><CadIcon name="close"/></button>}</label>
 <div className="cad-browser-scroll"><details className="cad-browser-group cad-browser-project" open><summary><CadIcon name="project"/>{renaming===project.id?<InlineName value={project.name} label="Nome do projeto" onCommit={onRenameProject} onDone={()=>setRenaming(undefined)}/>:<span>{project.name}</span>}<ItemMenu label={`Projeto ${project.name}`} actions={[{label:'Renomear projeto',onSelect:()=>setRenaming(project.id)},{label:'Excluir projeto',danger:true,onSelect:onDeleteProject}]}/></summary>
 <details className="cad-browser-group" open><summary><CadIcon name="floor"/><span>Pavimentos</span><button className="cad-tree-add" aria-label="Adicionar pavimento" onClick={e=>{e.preventDefault();onAddFloor()}}><CadIcon name="plus"/></button></summary>
 {project.floors.map(f=><details className="cad-browser-group" key={f.id} open={f.id===floorId||!!search}><summary><CadIcon name="folder"/>{renaming===f.id?<InlineName value={f.name} label="Nome do pavimento" onCommit={name=>onRenameFloor(f.id,name)} onDone={()=>setRenaming(undefined)}/>:<span>{f.name||'Sem nome'}</span>}<ItemMenu label={`Pavimento ${f.name}`} actions={[{label:'Renomear pavimento',onSelect:()=>setRenaming(f.id)},{label:'Excluir pavimento',danger:true,onSelect:()=>onDeleteFloor(f.id)}]}/></summary>
 <button className={`cad-browser-link ${view.kind==='plan'&&floorId===f.id?'selected':''}`} onClick={()=>onOpen({kind:'plan',key:'plan:'+f.id,floorId:f.id,name:'Planta Geral'})}><CadIcon name="plan"/>Planta Geral</button>
 <details className="cad-browser-group" open><summary><CadIcon name="folder"/><span>Ambientes</span><button className="cad-tree-add" aria-label={`Adicionar ambiente em ${f.name}`} onClick={e=>{e.preventDefault();onAddRoom(f.id)}}><CadIcon name="plus"/></button></summary>{roomRows(f.rooms,f.id)}</details>
 {f.rooms.some(r=>r.subrooms.length>0)&&<details className="cad-browser-group" open={!!search}><summary><CadIcon name="folder"/>Subambientes</summary>{f.rooms.filter(r=>r.subrooms.length>0).map(r=><details className="cad-browser-group" key={r.id} open><summary>{r.name}</summary>{roomRows(r.subrooms,f.id,true)}</details>)}</details>}
 {(project.roofs??[]).some(r=>r.floorId===f.id)&&<details className="cad-browser-group"><summary><CadIcon name="roof"/>Telhados</summary>{project.roofs?.filter(r=>r.floorId===f.id).map(r=><button className="cad-browser-link" key={r.id} onClick={()=>onRoof(r.id)}><CadIcon name="roof"/>{r.name||r.displayId}</button>)}</details>}
 </details>)}
 </details>
 <details className="cad-browser-group"><summary><CadIcon name="sheet"/>Folhas</summary>{sheets.map(s=><button key={sheetSourceKey(s)} className={`cad-browser-link ${view.key==='sheet:'+sheetSourceKey(s)?'selected':''}`} onClick={()=>onOpen({kind:'sheet',key:'sheet:'+sheetSourceKey(s),name:sheetSourceName(s)})}><CadIcon name="sheet"/>{sheetSourceName(s)}</button>)}<button className="cad-browser-link" onClick={()=>onOpen({kind:'documents',key:'documents',name:'Folhas e exportações'})}><CadIcon name="export"/>Composição do PDF…</button></details>
 <details className="cad-browser-group"><summary><CadIcon name="roof"/>Telhados</summary>{project.roofs?.filter(r=>!r.floorId).map(r=><button key={r.id} className="cad-browser-link" onClick={()=>onRoof(r.id)}><CadIcon name="roof"/>{r.name||r.displayId}</button>)}<button className="cad-browser-link" onClick={()=>onOpen({kind:'roofs',key:'roofs',name:'Telhados'})}>Gerenciar telhados…</button></details>
 <button className={`cad-browser-link ${view.kind==='photos'?'selected':''}`} onClick={()=>onOpen({kind:'photos',key:'photos',name:'Fotos'})}><CadIcon name="photo"/>Fotos</button>
 <button className="cad-browser-link" disabled={!flattenRooms(project.floors.flatMap(f=>f.rooms)).length} onClick={onChecklist}><CadIcon name="checklist"/>Checklist</button>
 <button className={`cad-browser-link ${view.kind==='issues'?'selected':''}`} onClick={()=>onOpen({kind:'issues',key:'issues',name:'Pendências'})}><CadIcon name="issue"/>Pendências{issueCount>0&&<span className="cad-tree-badge">{issueCount}</span>}</button>
 </details>
 <details className="cad-browser-group cad-browser-revit" open><summary><CadIcon name="sync"/>Revit</summary><button className="cad-browser-link" onClick={()=>onRevit('import')}><CadIcon name="sync"/>Sincronização</button><button className="cad-browser-link" onClick={()=>onRevit('changes')}><CadIcon name="eye"/>Alterações</button><button className="cad-browser-link" onClick={()=>onRevit('conflicts')}><CadIcon name="issue"/>Conflitos{conflicts>0&&<span className="cad-tree-badge danger">{conflicts}</span>}</button><button className="cad-browser-link" onClick={()=>onRevit('elements')}><CadIcon name="issue"/>Elementos incompatíveis{incompatible>0&&<span className="cad-tree-badge">{incompatible}</span>}</button></details>
 <details className="cad-browser-group cad-browser-settings"><summary><CadIcon name="properties"/>Configurações do projeto</summary>{settings}<button className="cad-browser-link" onClick={()=>onOpen({kind:'documents',key:'documents',name:'Documentos e backups'})}><CadIcon name="export"/>Documentos e backups</button></details>
 {!project.floors.length&&<p className="muted">Adicione um pavimento para começar.</p>}
 {search&&!project.floors.some(f=>f.rooms.some(r=>browserRoomMatches(r,search)))&&<p className="muted">Nenhum ambiente encontrado.</p>}
 </div></nav>
}
