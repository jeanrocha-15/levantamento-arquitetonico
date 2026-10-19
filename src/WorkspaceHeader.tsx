import { isDevPreview } from './releaseChannel'
import { useEffect, useRef, type ReactNode } from 'react'
import { themeNames } from './theme'
import type { ThemePreference } from './theme'
import CadIcon from './CadIcon'
export default function WorkspaceHeader({projectName,roomName,theme,onThemeChange,onUndo,onRedo,undoCount,redoCount,onPhotos,onIssues,children,selectors,onExport}:{selectors?:ReactNode;onExport?:()=>void;projectName:string;roomName:string;theme:ThemePreference;onThemeChange:(theme:ThemePreference)=>void;onUndo:()=>void;onRedo:()=>void;undoCount:number;redoCount:number;onPhotos:()=>void;onIssues:()=>void;children:ReactNode}) {
  const headerRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const measure = () => document.documentElement.style.setProperty('--header-height', String(headerRef.current?.offsetHeight ?? 88) + 'px')
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
    if (headerRef.current) observer?.observe(headerRef.current)
    window.addEventListener('resize', measure)
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure) }
  }, [])
  return <header ref={headerRef} className="app-header workspace-header"><a className="brand" href="./" aria-label="LAC — Levantamento Arquitetônico de Campo"><img className="lac-brand-symbol" src={`${import.meta.env.BASE_URL}lac-symbol.svg`} alt=""/><span className="lac-brand-text"><strong>LAC</strong><small>Levantamento<br/>Arquitetônico de Campo</small></span></a>{selectors?<div className="cad-header-selectors">{selectors}{isDevPreview&&<span className="dev-preview-badge">DEV</span>}</div>:<div className="header-context">{isDevPreview&&<span className="dev-preview-badge">PRÉVIA · DEV</span>}<strong title={projectName}>{projectName}</strong><span title={roomName}>{roomName}</span></div>}<div className="header-status">{children}</div><div className="header-actions">{!selectors&&<><button onClick={onUndo} disabled={!undoCount} aria-label="Desfazer" title="Desfazer (Ctrl+Z)"><CadIcon name="undo"/><span>Desfazer</span></button><button onClick={onRedo} disabled={!redoCount} aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)"><CadIcon name="redo"/><span>Refazer</span></button></>}<details className="header-global-actions"><summary title="Ações do projeto" aria-label="Ações do projeto"><CadIcon name="more"/></summary><div><button onClick={onPhotos}>Fotos do projeto</button><button onClick={onIssues}>Pendências do projeto</button></div></details><label className="header-theme"><CadIcon name={theme==='dark'?'moon':'sun'}/><span className="sr-only">Tema</span><select aria-label="Tema" value={theme} onChange={event=>onThemeChange(event.target.value as ThemePreference)}>{Object.entries(themeNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>{onExport&&<button className="cad-export-button" onClick={onExport}><CadIcon name="export"/>Exportar</button>}</div></header>
}
