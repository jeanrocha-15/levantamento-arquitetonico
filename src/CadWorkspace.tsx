import {createContext,useContext,useEffect,useRef,useState} from 'react'
import type {CSSProperties,ReactNode} from 'react'
import {createPortal} from 'react-dom'

export const CAD_CATEGORIES=['Projeto','Levantamento','Aberturas','Elementos','Anotar','Planta Geral','Revit','Exportar'] as const
export type CadCategory=typeof CAD_CATEGORIES[number]
const CadContext=createContext<{target:HTMLDivElement|null;setTarget:(node:HTMLDivElement|null)=>void;category:CadCategory;statusTarget:HTMLSpanElement|null;browser:boolean;properties:boolean;toggleBrowser:()=>void;toggleProperties:()=>void;showProperties:()=>void}|null>(null)
export function CadCommands({area,children,inline=false}:{area:CadCategory;children:ReactNode;inline?:boolean}){
 const context=useContext(CadContext)
 return !inline&&context?.target&&context.category===area?createPortal(children,context.target):children
}
export function CadStatus({children}:{children:ReactNode}){const c=useContext(CadContext);return c?.statusTarget?createPortal(children,c.statusTarget):null}
export function ContextHelp({children}:{children:ReactNode}){return <details className="context-help"><summary title="Orientações de uso">? Ajuda</summary>{children}</details>}
export const useRevealProperties=()=>useContext(CadContext)?.showProperties??(()=>{})
export const useCadEditor=()=>!!useContext(CadContext)
export default function CadWorkspace({children,category,selection,status}:{children:ReactNode;category:CadCategory;selection:string;status:ReactNode}){
 const [browser,setBrowser]=useState(()=>typeof window==='undefined'||window.innerWidth>900),[properties,setProperties]=useState(()=>typeof window==='undefined'||window.innerWidth>900)
 const [left,setLeft]=useState(220),[right,setRight]=useState(320),[target,setTarget]=useState<HTMLDivElement|null>(null)
 const [statusTarget,setStatusTarget]=useState<HTMLSpanElement|null>(null)
 const root=useRef<HTMLDivElement>(null),drag=useRef<'left'|'right'|undefined>(undefined)
 const previousSelection=useRef(selection)
 useEffect(()=>{if(previousSelection.current!==selection){setProperties(true);if(window.innerWidth<=900)setBrowser(false);previousSelection.current=selection}},[selection])
 const resize=(side:'left'|'right',value:number)=>side==='left'?setLeft(Math.max(180,Math.min(360,value))):setRight(Math.max(270,Math.min(520,value)))
 return <CadContext value={{target,setTarget,category,statusTarget,browser,properties,toggleBrowser:()=>setBrowser(v=>!v),toggleProperties:()=>setProperties(v=>!v),showProperties:()=>setProperties(true)}}><div ref={root} className={`cad-editor ${browser?'browser-open':'browser-closed'} ${properties?'properties-open':'properties-closed'}`} style={{'--browser-width':`${left}px`,'--properties-width':`${right}px`} as CSSProperties}>
 {children}
 {(['left','right'] as const).map(side=><div key={side} className={`cad-panel-divider cad-divider-${side}`} role="separator" aria-orientation="vertical" aria-label={`Redimensionar ${side==='left'?'Navegador':'Propriedades'}`} aria-valuemin={side==='left'?180:270} aria-valuemax={side==='left'?360:520} aria-valuenow={side==='left'?left:right} tabIndex={0} onKeyDown={e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();resize(side,(side==='left'?left:right)+(e.key==='ArrowLeft'?-10:10)*(side==='left'?1:-1))}}} onPointerDown={e=>{drag.current=side;e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(drag.current!==side||!root.current)return;const rect=root.current.getBoundingClientRect();resize(side,side==='left'?e.clientX-rect.left:rect.right-e.clientX)}} onPointerUp={()=>{drag.current=undefined}} onPointerCancel={()=>{drag.current=undefined}}/>)}
 <footer className="cad-status" aria-label="Estado do levantamento">{status}<span className="cad-live-status" ref={setStatusTarget}/><span className="cad-status-hint">Zoom visual · medidas preservadas</span></footer>
 </div></CadContext>
}
export function CadRibbon({category,onCategory,commands}:{category:CadCategory;onCategory:(value:CadCategory)=>void;commands:ReactNode}){
 const context=useContext(CadContext)!
 return <div className="cad-ribbon"><div className="cad-ribbon-tabs" role="toolbar" aria-label="Categorias de ferramentas"><button aria-controls="project-navigation" aria-expanded={context.browser} onClick={context.toggleBrowser} title="Mostrar/recolher Navegador">☰ <span>Navegador</span></button>{CAD_CATEGORIES.map(c=><button key={c} aria-pressed={c===category} onClick={()=>{context.showProperties();onCategory(c)}}>{c}</button>)}<button className="cad-properties-toggle" aria-expanded={context.properties} onClick={context.toggleProperties}>Propriedades</button></div><div className="cad-command-line"><span className="cad-command-category">{category}</span>{commands}<div className="cad-command-slot" ref={context.setTarget}/></div></div>
}
export interface CadView {key:string;kind:'room'|'plan'|'roofs'|'photos'|'issues'|'documents'|'revit'|'report'|'sheet';floorId?:string;roomId?:string;name:string}
export function CadViewTabs({projectId,current,isValid,onOpen}:{projectId:string;current:CadView;isValid:(view:CadView)=>boolean;onOpen:(view:CadView)=>void}){
 const [opened,setOpened]=useState<{projectId:string;views:CadView[]}>({projectId,views:[current]})
 const views=(opened.projectId===projectId?opened.views:[]).filter(isValid)
 const shown=views.some(v=>v.key===current.key)?views.map(v=>v.key===current.key?current:v):[...views,current]
 useEffect(()=>{setOpened(previous=>({projectId,views:previous.projectId!==projectId?[current]:previous.views.some(v=>v.key===current.key)?previous.views.map(v=>v.key===current.key?current:v):[...previous.views,current]}))},[projectId,current.key,current.name])
 return <div className="cad-view-tabs" role="tablist" aria-label="Visualizações abertas">{shown.map(view=><div key={view.key} className={view.key===current.key?'active':''}><button role="tab" aria-selected={view.key===current.key} onClick={()=>onOpen(view)} title={view.name}>{view.name}</button>{shown.length>1&&<button aria-label={`Fechar aba ${view.name}`} onClick={()=>{const rest=shown.filter(v=>v.key!==view.key);setOpened({projectId,views:rest});if(view.key===current.key)onOpen(rest.at(-1)!)}}>×</button>}</div>)}</div>
}
