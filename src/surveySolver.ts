import type { Wall,Diagonal,Corner } from './models'
import type { Point } from './geometry'
export const positiveLength=(n:number|null|undefined):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>0
export const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y)
export function circleIntersections(a:Point,ra:number,b:Point,rb:number):Point[] {
 const d=distance(a,b),eps=1e-9*Math.max(1,ra,rb,d);if(!positiveLength(ra)||!positiveLength(rb)||d<eps||d>ra+rb+eps||d<Math.abs(ra-rb)-eps)return []
 const x=(ra*ra-rb*rb+d*d)/(2*d),h=Math.sqrt(Math.max(0,ra*ra-x*x)),dx=(b.x-a.x)/d,dy=(b.y-a.y)/d,center={x:a.x+dx*x,y:a.y+dy*x}
 return h<eps?[center]:[{x:center.x-dy*h,y:center.y+dx*h},{x:center.x+dy*h,y:center.y-dx*h}]
}
export interface SurveyResidual {id:string;kind:'wall'|'diagonal'|'angle';measured:number;result:number;difference:number}
const rad=(a:number)=>a*Math.PI/180,wrap=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a))
function solveLinear(matrix:number[][],rhs:number[]) {const a=matrix.map((row,i)=>[...row,rhs[i]]),n=rhs.length;for(let i=0;i<n;i++){let pivot=i;for(let k=i+1;k<n;k++)if(Math.abs(a[k][i])>Math.abs(a[pivot][i]))pivot=k;if(Math.abs(a[pivot][i])<1e-14)return undefined;[a[i],a[pivot]]=[a[pivot],a[i]];const divisor=a[i][i];for(let j=i;j<=n;j++)a[i][j]/=divisor;for(let k=0;k<n;k++)if(k!==i){const factor=a[k][i];for(let j=i;j<=n;j++)a[k][j]-=factor*a[i][j]}}return a.map(row=>row[n])}
// Deterministic damped least squares; returns derived coordinates, never writes measurements.
function minimize(initial:number[],residual:(x:number[])=>number[],iterations=45) {
 let x=[...initial],r=residual(x),cost=r.reduce((s,v)=>s+v*v,0),lambda=.001
 if(cost<1e-18)return x
 // Large perimeters use bounded coordinate sweeps instead of a dense matrix.
 if(x.length>120){for(let pass=0;pass<12;pass++){let gain=0;for(let j=0;j<x.length;j++){const h=1e-5*Math.max(1,Math.abs(x[j])),probe=[...x];probe[j]+=h;const pr=residual(probe),derivative=pr.map((v,i)=>(v-r[i])/h),gradient=derivative.reduce((s,v,i)=>s+v*r[i],0),curvature=derivative.reduce((s,v)=>s+v*v,.001);let step=-gradient/curvature;const limit=Math.max(.25,Math.abs(x[j])*.1);step=Math.max(-limit,Math.min(limit,step));for(let attempt=0;attempt<4;attempt++){const next=[...x];next[j]+=step;const nr=residual(next),nc=nr.reduce((s,v)=>s+v*v,0);if(nc<cost){gain+=cost-nc;x=next;r=nr;cost=nc;break}step/=2}}if(gain<1e-10)break}return x}
 for(let iteration=0;iteration<iterations&&x.length;iteration++){const jac=x.map((v,j)=>{const h=1e-5*Math.max(1,Math.abs(v)),trial=[...x];trial[j]+=h;const next=residual(trial);return next.map((v,i)=>(v-r[i])/h)}),n=x.length,normal=Array.from({length:n},()=>Array(n).fill(0) as number[]),rhs=Array(n).fill(0) as number[];for(let i=0;i<n;i++){for(let j=0;j<n;j++)normal[i][j]=jac[i].reduce((s,v,k)=>s+v*jac[j][k],0);normal[i][i]+=lambda;rhs[i]=-jac[i].reduce((s,v,k)=>s+v*r[k],0)}const delta=solveLinear(normal,rhs);if(!delta)break;const next=x.map((v,i)=>v+delta[i]),nr=residual(next),nc=nr.reduce((s,v)=>s+v*v,0);if(nc<cost){x=next;r=nr;const gain=cost-nc;cost=nc;lambda=Math.max(1e-9,lambda/3);if(gain<1e-12||Math.max(...delta.map(Math.abs))<1e-7)break}else lambda=Math.min(1e9,lambda*5)}
 return x
}
export function solveSurveyGeometry(walls:Wall[],corners:Corner[],diagonals:Diagonal[],seed:Point[],options:{adjust?:boolean;closed?:boolean}={}) {
 const notes:string[]=[],points=seed.map(p=>({...p})),angles=(list:Point[])=>walls.map((_,i)=>Math.atan2(list[i+1].y-list[i].y,list[i+1].x-list[i].x)),vertexIndex=(id:string)=>{if(id==='origin')return 0;const i=walls.findIndex(w=>w.id===id);return i<0?-1:i+1}
 const indexForCorner=(id:string)=>{const i=corners.findIndex(c=>c.id===id);return i<0?-1:i===walls.length-1?0:i+1}
 const diagonalEnds=(d:Diagonal)=>d.vertexIds?d.vertexIds.map(vertexIndex):d.cornerIds.map(indexForCorner)
 for(let i=0;i<walls.length;i++){const wall=walls[i],placement=wall.surveyPlacement;if(!placement||!positiveLength(wall.lengthM))continue;const start=points[i],prev=i?Math.atan2(points[i].y-points[i-1].y,points[i].x-points[i-1].x):0;let end:Point|undefined
  if(placement.method==='diagonal'){const diagonal=diagonals.find(d=>d.id===placement.diagonalId);if(diagonal?.checkOnly)continue;const referenceId=diagonal?.vertexIds?.find(id=>id!==wall.id)??placement.referenceVertexId,reference=referenceId?vertexIndex(referenceId):-1;if(diagonal&&positiveLength(diagonal.lengthM)&&reference>=0&&reference<i){const choices=circleIntersections(start,wall.lengthM,points[reference],diagonal.lengthM);end=choices[placement.side===-1?1:0]??choices[0];if(!end)notes.push(`Parede ${wall.label}: parede e diagonal não formam um triângulo válido.`)}else notes.push(`Parede ${wall.label}: faltam referências válidas para localizar o vértice.`)}
  else {const heading=placement.method==='closure'?Math.atan2(-start.y,-start.x):i===0?0:prev+rad(180-(corners[i-1]?.angleSource==='informed'&&positiveLength(corners[i-1].angleDegrees)?corners[i-1].angleDegrees!:placement.method==='orthogonal'?90:placement.angleDegrees??90));end={x:start.x+Math.cos(heading)*wall.lengthM,y:start.y+Math.sin(heading)*wall.lengthM}}
  if(end){const dx=end.x-points[i+1].x,dy=end.y-points[i+1].y;for(let j=i+1;j<points.length;j++){points[j].x+=dx;points[j].y+=dy}}
 }
 const active=diagonals.filter(d=>!d.checkOnly&&positiveLength(d.lengthM)&&diagonalEnds(d).every(i=>i>=0&&i<points.length)&&diagonalEnds(d)[0]!==diagonalEnds(d)[1]),meanLength=walls.reduce((s,w)=>s+(positiveLength(w.lengthM)?w.lengthM:0),0)/Math.max(1,walls.length),initialAngles=angles(points)
 const branchResiduals=(p:Point[])=>walls.flatMap((w,i)=>{const placement=w.surveyPlacement;if(placement?.method!=='diagonal')return [];const diagonal=active.find(d=>d.id===placement.diagonalId),referenceId=diagonal?.vertexIds?.find(id=>id!==w.id)??placement.referenceVertexId,ref=referenceId?vertexIndex(referenceId):-1;if(!diagonal||ref<0||ref>=i)return [];const a=p[i],b=p[ref],end=p[i+1],d=distance(a,b)||1,cross=((b.x-a.x)*(end.y-a.y)-(b.y-a.y)*(end.x-a.x))/d;return [Math.max(0,-(placement.side??1)*cross)*10]})
 if(active.length&&!options.adjust){
  const variables=walls.flatMap((_,i)=>i>0&&corners[i-1]?.angleSource!=='informed'?[i]:[])
  const make=(x:number[])=>{const result:Point[]=[{x:0,y:0}];let heading=0;for(let i=0;i<walls.length;i++){if(i){const j=variables.indexOf(i);heading=j>=0?x[j]:heading+rad(180-(corners[i-1].angleDegrees??90))}const length=positiveLength(walls[i].lengthM)?walls[i].lengthM!:distance(points[i],points[i+1]);const start=result[i];result.push({x:start.x+Math.cos(heading)*length,y:start.y+Math.sin(heading)*length})}return result}
  const solution=minimize(variables.map(i=>initialAngles[i]),x=>{const p=make(x);return [...active.map(d=>{const [a,b]=diagonalEnds(d);return distance(p[a],p[b])-d.lengthM!}),...branchResiduals(p),...(options.closed?[p.at(-1)!.x,p.at(-1)!.y]:[]),...x.map((v,j)=>wrap(v-initialAngles[variables[j]])*Math.max(.001,meanLength)*.00001)]})
  const result=make(solution);points.splice(0,points.length,...result)
 }
 if(options.adjust&&walls.length>=2){
  const initial=points.flatMap((p,i)=>i===0?[]:i===1?[p.x]:[p.x,p.y]),make=(x:number[])=>{let k=0;return [{x:0,y:0},...walls.map((_,i)=>i===0?{x:x[k++],y:0}:{x:x[k++],y:x[k++]})]}
  const solution=minimize(initial,x=>{const p=make(x),headings=angles(p);return [...walls.flatMap((w,i)=>positiveLength(w.lengthM)?[distance(p[i],p[i+1])-w.lengthM]:[]),...active.map(d=>{const [a,b]=diagonalEnds(d);return distance(p[a],p[b])-d.lengthM!}),...corners.flatMap((c,i)=>c.angleSource==='informed'&&positiveLength(c.angleDegrees)?[wrap(headings[(i+1)%walls.length]-headings[i]-rad(180-c.angleDegrees))*Math.max(meanLength,.01)]:[]),...branchResiduals(p),...(options.closed?[p.at(-1)!.x,p.at(-1)!.y]:[]),...x.map((v,i)=>(v-initial[i])*.000001)]},70)
  points.splice(0,points.length,...make(solution))
 }
 const headings=angles(points),residuals:SurveyResidual[]=[]
 walls.forEach((w,i)=>{if(positiveLength(w.lengthM)){const result=distance(points[i],points[i+1]);residuals.push({id:w.id,kind:'wall',measured:w.lengthM,result,difference:Math.abs(result-w.lengthM)})}})
 diagonals.forEach(d=>{const [a,b]=diagonalEnds(d);if(positiveLength(d.lengthM)&&a>=0&&b>=0&&a<points.length&&b<points.length){const result=distance(points[a],points[b]);residuals.push({id:d.id,kind:'diagonal',measured:d.lengthM,result,difference:Math.abs(result-d.lengthM)})}})
 const visualAngles=headings.map((heading,i)=>{const turn=wrap(headings[(i+1)%headings.length]-heading)*180/Math.PI;return ((180-turn)%360+360)%360})
 corners.forEach((c,i)=>{if(c.angleSource==='informed'&&positiveLength(c.angleDegrees))residuals.push({id:c.id,kind:'angle',measured:c.angleDegrees,result:visualAngles[i],difference:Math.abs(wrap(rad(visualAngles[i]-c.angleDegrees))*180/Math.PI)})})
 return {points,visualAngles,residuals,notes}
}
