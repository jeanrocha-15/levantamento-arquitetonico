// React delegates wheel events passively; cancel browser scrolling at the grid itself.
export function bindGridWheel(target:EventTarget,onWheel:(event:WheelEvent)=>void){
 const handler=(event:Event)=>{event.preventDefault();event.stopPropagation();onWheel(event as WheelEvent)}
 target.addEventListener('wheel',handler,{passive:false,capture:true})
 return ()=>target.removeEventListener('wheel',handler,{capture:true})
}
