import { useState } from 'react'
import type { Project } from './models'
import { projectRooms } from './relationships'
import { keepAssemblyPosition,recalculateAssembly } from './assemblyChanges'
export default function AssemblyChangeNotice({project,onChange,roomId}:{project:Project;onChange:(p:Project)=>void;roomId?:string}) {
 const [error,setError]=useState(''),rooms=projectRooms(project).filter(r=>project.geometryChangedRoomIds?.includes(r.id)&&(!roomId||roomId===r.id))
 return <>{rooms.map(room=><section className="geometry-status" key={room.id} role="status"><strong>A geometria deste ambiente mudou.</strong><p>{room.displayId} — {room.name}. Os ambientes mantiveram suas posições.</p><button onClick={()=>{const result=recalculateAssembly(project,room.id);setError(result.error??'');if(!result.error)onChange(result.project)}}>Recalcular encaixe</button><button onClick={()=>{setError('');onChange(keepAssemblyPosition(project,room.id))}}>Manter posição atual</button></section>)}{error&&<p role="alert">{error}</p>}</>
}
