import type { RoomObject, StructuralMaterial, StructuralProfile } from './models'
import { MeasurementInput,useMeasurements } from './Measurement'
import { materialNames,profileNames,structuralVerification } from './structural'
export default function StructuralFields({object,onChange}:{object:RoomObject;onChange:(change:Partial<RoomObject>)=>void}) {
  const {unit}=useMeasurements(),d=object.dimensions,p=object.profile
  const field=(key:keyof typeof d,label:string)=><label>{label} ({unit})<MeasurementInput data-pending-field="dimensions" value={d[key]} onValue={value=>onChange({dimensions:{...d,[key]:value}})}/></label>
  const profiles=object.structuralKind==='column'?['square','rectangular','circular','I','H','custom']:['rectangular','square','I','H','T','L','U/C','tubular','custom']
  return <><label>Forma / perfil<select data-pending-field="shape" value={p ?? ''} onChange={e=>onChange({profile:e.target.value as StructuralProfile || undefined,shape:e.target.value==='circular'?'circle':'rectangle'})}><option value="">Ainda não definido</option>{profiles.map(key=><option key={key} value={key}>{profileNames[key as StructuralProfile]}</option>)}</select></label>{p==='custom' && <label>Descrição da forma/perfil<input value={object.customProfile ?? ''} onChange={e=>onChange({customProfile:e.target.value})}/></label>}
    {p==='circular'?field('diameterM','Diâmetro'):<>{field('widthM',p==='square'?'Lado da seção':'Largura da seção')}{p!=='square' && field(object.structuralKind==='beam'?'heightM':'depthM',object.structuralKind==='beam'?'Altura da seção':'Profundidade da seção')}</>}
    {object.structuralKind==='beam'?field('lengthM','Comprimento da viga'):field('heightM','Altura do pilar (opcional)')}
    {p && ['I','H','T','L','U/C','tubular'].includes(p) && <>{field('webM',p==='tubular'?'Espessura do tubo':'Espessura da alma')}{p!=='tubular' && field('flangeM','Espessura da mesa/aba')}</>}
    <label>Material<select data-pending-field="material" value={object.material ?? ''} onChange={e=>onChange({material:e.target.value as StructuralMaterial || undefined})}><option value="">Ainda não definido</option>{Object.entries(materialNames).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label>{object.material==='other' && <label>Nome do material<input value={object.customMaterial ?? ''} onChange={e=>onChange({customMaterial:e.target.value})}/></label>}
    <div className="structural-checks">{structuralVerification(object).map(check=><span key={check.key}>{check.completed?'✓':'⚠'} {check.label}</span>)}</div>
  </>
}
