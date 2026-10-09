import type {Room} from './models'
export const DEFAULT_CLEAR_HEIGHT_M=2.5
export const CEILING_VOID_M=.5
// Assumptions are derived, never written over surveyed values.
export function roomWallHeight(room:Pick<Room,'ceilingHeightM'|'ceilingType'>) {
 const clearHeightM=room.ceilingHeightM??DEFAULT_CLEAR_HEIGHT_M
 const ceilingType=room.ceilingType??'suspended'
 return {clearHeightM,ceilingType,assumed:room.ceilingHeightM==null,wallHeightM:(!Number.isFinite(clearHeightM)||clearHeightM<=0)?NaN:clearHeightM+(ceilingType==='suspended'?CEILING_VOID_M:0)}
}
