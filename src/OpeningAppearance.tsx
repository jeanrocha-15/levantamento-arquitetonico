import type { Opening, DoorVisualType, WindowVisualType, OpeningMaterial } from './models'
import { doorVisualNames, windowVisualNames, openingMaterialNames, visualDoor } from './openingSymbols'
export default function OpeningAppearance({opening,update}:{opening:Opening;update:(value:Partial<Opening>)=>void}){
 const type=visualDoor(opening),names=opening.type==='window'?windowVisualNames:doorVisualNames
 return <><label>Tipo visual<select value={opening.type==='window'?opening.windowVisualType??'fixed':type} onChange={e=>update(opening.type==='window'?{windowVisualType:e.target.value as WindowVisualType}:{doorVisualType:e.target.value as DoorVisualType,doorKind:e.target.value.startsWith('slide')?'sliding':'hinged'})}>{Object.entries(names).map(([value,name])=><option key={value} value={value}>{name}</option>)}</select></label>
 {(opening.type==='window'?opening.windowVisualType:type)==='other'&&<label>Nome do tipo<input value={opening.customVisualType??''} onChange={e=>update({customVisualType:e.target.value})}/></label>}
 <label>Material<select value={opening.material??''} onChange={e=>update({material:e.target.value as OpeningMaterial||undefined})}><option value="">Não informado</option>{Object.entries(openingMaterialNames).map(([value,name])=><option key={value} value={value}>{name}</option>)}</select></label>{opening.material==='other'&&<label>Material personalizado<input value={opening.customMaterial??''} onChange={e=>update({customMaterial:e.target.value})}/></label>}
 {opening.type==='door'&&type==='folding'&&<label>Número de folhas<input type="number" min="2" max="8" value={opening.leafCount??4} onChange={e=>update({leafCount:Math.max(2,Math.min(8,Number(e.target.value)))})}/></label>}</>
}
