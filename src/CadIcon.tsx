import type {ButtonHTMLAttributes} from 'react'

const paths={
 select:'M5 3l13 10-6 1-3 6z',hand:'M8 12V6a1.5 1.5 0 013 0v5-7a1.5 1.5 0 013 0v7-5a1.5 1.5 0 013 0v6-3a1.5 1.5 0 013 0v5c0 5-3 7-6 7h-2c-2 0-3-1-4-3l-4-5a1.5 1.5 0 012-2l2 2',
 wall:'M5 4h14v16H5z M8 4v16 M16 4v16',internal:'M4 4h5v16H4z M15 4h5v16h-5z M9 12h6',diagonal:'M4 20L20 4 M3 17v4h4 M17 3h4v4',measure:'M4 15L15 4l5 5L9 20z M12 7l2 2 M9 10l2 2 M6 13l2 2',dimension:'M4 7v11 M20 7v11 M4 12h16 M7 9l-3 3 3 3 M17 9l3 3-3 3',
 door:'M5 20V4h14v16 M5 20l10-3V4 M12 12h1',window:'M4 5h16v14H4z M12 5v14 M4 12h16',gap:'M4 5h4v14H4 M20 5h-4v14h4 M8 12h8',object:'M4 8l8-4 8 4v10l-8 4-8-4z M4 8l8 4 8-4 M12 12v10',equipment:'M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h3',column:'M7 3h10v4H7z M9 7v12 M15 7v12 M7 19h10v3H7z',beam:'M3 6h18v4H3z M7 10v9 M17 10v9 M4 19h16',
 plan:'M3 3h18v18H3z M3 11h9V3 M12 11v10 M12 15h9',room:'M4 3h16v18H4z M7 7h10v10H7z',project:'M3 10l9-7 9 7 M5 9v12h14V9 M10 21v-7h4v7',floor:'M3 8l9-5 9 5-9 5z M3 12l9 5 9-5 M3 16l9 5 9-5',folder:'M3 6h7l2 2h9v12H3z',sheet:'M5 3h10l4 4v14H5z M15 3v5h4 M8 12h8 M8 16h8',roof:'M3 12l9-9 9 9-9 9z M3 12h18 M12 3v18',
 photo:'M3 7h5l2-3h4l2 3h5v14H3z M16 13a4 4 0 11-8 0 4 4 0 018 0',checklist:'M5 3h14v18H5z M8 8l1 1 2-2 M13 8h3 M8 14l1 1 2-2 M13 14h3',issue:'M12 3L2 21h20z M12 9v5 M12 17v1',sync:'M20 8a8 8 0 00-14-3L3 8 M3 3v5h5 M4 16a8 8 0 0014 3l3-3 M21 21v-5h-5',link:'M10 14l4-4 M8 16H6a4 4 0 010-8h4 M14 8h4a4 4 0 010 8h-4',
 export:'M12 3v12 M8 11l4 4 4-4 M4 14v7h16v-7',import:'M12 15V3 M8 7l4-4 4 4 M4 14v7h16v-7',undo:'M8 5L3 10l5 5 M3 10h10a6 6 0 016 6',redo:'M16 5l5 5-5 5 M21 10H11a6 6 0 00-6 6',move:'M12 2v20 M2 12h20 M9 5l3-3 3 3 M9 19l3 3 3-3 M5 9l-3 3 3 3 M19 9l3 3-3 3',rotate:'M19 7a8 8 0 11-6-3 M19 2v6h-6',lock:'M5 10h14v11H5z M8 10V7a4 4 0 018 0v3 M12 14v3',fit:'M3 9V3h6 M15 3h6v6 M21 15v6h-6 M9 21H3v-6',zoom:'M15 15l6 6 M17 10a7 7 0 11-14 0 7 7 0 0114 0 M7 10h6 M10 7v6',grid:'M3 3h18v18H3z M9 3v18 M15 3v18 M3 9h18 M3 15h18',
 search:'M16 16l5 5 M18 10a8 8 0 11-16 0 8 8 0 0116 0',properties:'M5 3v18 M12 3v18 M19 3v18 M2 8h6 M9 16h6 M16 8h6',close:'M6 6l12 12 M6 18L18 6',plus:'M12 4v16 M4 12h16',minus:'M4 12h16',trash:'M4 6h16 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',info:'M12 11v6 M12 7v1 M21 12a9 9 0 11-18 0 9 9 0 0118 0',sun:'M12 3V1 M12 23v-2 M3 12H1 M23 12h-2 M5 5L3 3 M21 21l-2-2 M5 19l-2 2 M21 3l-2 2 M17 12a5 5 0 11-10 0 5 5 0 0110 0',moon:'M20 15A9 9 0 019 3a9 9 0 1011 12',more:'M5 12h1 M11 12h1 M17 12h1',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7 M15 12a3 3 0 11-6 0 3 3 0 016 0',
} as const
export type CadIconName=keyof typeof paths
export default function CadIcon({name,className=''}:{name:CadIconName;className?:string}){
 return <svg className={`cad-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]}/></svg>
}
export function CadTool({icon,children,className='',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{icon:CadIconName}){
 return <button {...props} className={`cad-tool ${className}`}><CadIcon name={icon}/><span>{children}</span></button>
}
