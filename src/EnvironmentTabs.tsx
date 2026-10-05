import { useEffect, useId, useRef } from 'react'
import { ENVIRONMENT_SECTIONS } from './environmentNavigation'
import type { EnvironmentSection } from './environmentNavigation'
export default function EnvironmentNavigation({active,onChange}:{active:EnvironmentSection;onChange:(section:EnvironmentSection)=>void}) {
  const id=useId()
  const tabs=useRef<HTMLDivElement>(null)
  useEffect(()=>{ const list=tabs.current, button=list?.querySelector<HTMLElement>('[aria-selected=true]'); if(list && button){ if(button.offsetLeft < list.scrollLeft) list.scrollLeft=button.offsetLeft; else if(button.offsetLeft+button.offsetWidth > list.scrollLeft+list.clientWidth) list.scrollLeft=button.offsetLeft+button.offsetWidth-list.clientWidth } },[active])
  return <nav className="environment-navigation" aria-label="Categorias do ambiente"><div ref={tabs} role="tablist" aria-label="Dados do ambiente" aria-describedby={id}>{ENVIRONMENT_SECTIONS.map((section,index)=><button key={section.id} id={`environment-tab-${section.id}`} role="tab" aria-selected={active===section.id} aria-controls="environment-content" tabIndex={active===section.id?0:-1} onClick={()=>onChange(section.id)} onKeyDown={event=>{
    let next:number|undefined
    if(event.key==='ArrowRight') next=(index+1)%ENVIRONMENT_SECTIONS.length
    if(event.key==='ArrowLeft') next=(index+ENVIRONMENT_SECTIONS.length-1)%ENVIRONMENT_SECTIONS.length
    if(event.key==='Home') next=0
    if(event.key==='End') next=ENVIRONMENT_SECTIONS.length-1
    if(next!==undefined){event.preventDefault();onChange(ENVIRONMENT_SECTIONS[next].id);event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus()}
  }}><span className="module-number" aria-hidden="true">{String(index+1).padStart(2,'0')}</span>{section.label}</button>)}</div><span className="sr-only" id={id}>Use as setas para alternar categorias.</span></nav>
}
