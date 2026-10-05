import { useEffect, useRef, type ReactNode } from 'react'
import { themeNames } from './theme'
import type { ThemePreference } from './theme'
export default function WorkspaceHeader({projectName,roomName,theme,onThemeChange,onUndo,onRedo,undoCount,redoCount,onPhotos,onIssues,children}:{projectName:string;roomName:string;theme:ThemePreference;onThemeChange:(theme:ThemePreference)=>void;onUndo:()=>void;onRedo:()=>void;undoCount:number;redoCount:number;onPhotos:()=>void;onIssues:()=>void;children:ReactNode}) {
  const headerRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const measure = () => document.documentElement.style.setProperty('--header-height', String(headerRef.current?.offsetHeight ?? 88) + 'px')
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
    if (headerRef.current) observer?.observe(headerRef.current)
    window.addEventListener('resize', measure)
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure) }
  }, [])
  return <header ref={headerRef} className="app-header workspace-header"><a className="brand" href="./" aria-label="LAC — Levantamento Arquitetônico de Campo"><img className="lac-brand-symbol" src={`${import.meta.env.BASE_URL}lac-symbol.svg`} alt=""/><span className="lac-brand-text"><strong>LAC</strong><small>Levantamento Arquitetônico<br/>de Campo</small></span></a><div className="header-context"><strong title={projectName}>{projectName}</strong><span title={roomName}>{roomName}</span></div><div className="header-actions"><button onClick={onUndo} disabled={!undoCount} aria-label="Desfazer" title="Desfazer (Ctrl+Z)">↶ <span>Desfazer</span></button><button onClick={onRedo} disabled={!redoCount} aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)">↷ <span>Refazer</span></button><details className="header-global-actions"><summary>Ações</summary><div><button onClick={onPhotos}>Fotos do projeto</button><button onClick={onIssues}>Pendências do projeto</button></div></details><label className="header-theme">Tema<select value={theme} onChange={event=>onThemeChange(event.target.value as ThemePreference)}>{Object.entries(themeNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div><div className="header-status">{children}</div></header>
}
