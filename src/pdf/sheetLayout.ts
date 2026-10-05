// Folhas, escalas e enquadramento em ESCALA FÍSICA REAL: 1 m no ambiente = 1000/escala mm no papel.
// Nunca há "ajustar à página": se o desenho não cabe, o app avisa e sugere combinações que cabem.
export type SheetSize = 'A4' | 'A3' | 'A2' | 'A1' | 'A0'
export type Orientation = 'portrait' | 'landscape'
export const SHEETS: Record<SheetSize, { width: number; height: number }> = { A4:{width:210,height:297},A3:{width:297,height:420},A2:{width:420,height:594},A1:{width:594,height:841},A0:{width:841,height:1189} }
export const SCALES = [10,20,25,50,75,100,125,150,200,250,500,1000] as const
// A positive denominator also supports a future custom-scale control.
export type Scale = number
export const orientationNames: Record<Orientation, string> = { portrait: 'retrato', landscape: 'paisagem' }
export const MARGIN_MM = 10
export const TITLE_BLOCK_MM = 64
export const LABEL_ROOM_MM = 14 // espaço em volta do desenho para cotas e rótulos
export interface SheetOption { sheet: SheetSize; orientation: Orientation; scale: Scale }

export const mmOnPaper = (meters: number, scale: number) => meters * 1000 / scale
export function paperSize({ sheet, orientation }: Pick<SheetOption, 'sheet' | 'orientation'>) {
  const { width, height } = SHEETS[sheet]
  return orientation === 'portrait' ? { width, height } : { width: height, height: width }
}
export function drawingArea(option: Pick<SheetOption, 'sheet' | 'orientation'>) {
  const paper = paperSize(option)
  return { x: MARGIN_MM, y: MARGIN_MM, width: paper.width - 2 * MARGIN_MM, height: paper.height - 2 * MARGIN_MM - TITLE_BLOCK_MM }
}
export interface DrawingExtent {width:number;height:number;extraHeightMm?:number}
export function fits(extentM: DrawingExtent, option: SheetOption) {
  if(!Number.isFinite(option.scale)||option.scale<=0||![extentM.width,extentM.height].every(v=>Number.isFinite(v)&&v>=0))return false
  const area = drawingArea(option)
  return mmOnPaper(extentM.width, option.scale) + 2 * LABEL_ROOM_MM <= area.width && mmOnPaper(extentM.height, option.scale) + 2 * LABEL_ROOM_MM + (extentM.extraHeightMm??0) <= area.height
}
// Sugestões: maior escala (mais detalhe) primeiro, depois a folha menor.
export function fittingOptions(extentM: DrawingExtent | ((option:SheetOption)=>DrawingExtent)): SheetOption[] {
  const all: SheetOption[] = []
  for (const scale of SCALES) for (const sheet of Object.keys(SHEETS) as SheetSize[]) for (const orientation of ['portrait', 'landscape'] as const) {const option={sheet,orientation,scale};if(fits(typeof extentM==='function'?extentM(option):extentM,option)) all.push(option)}
  return all
}
export const optionLabel = (option: SheetOption) => `${option.sheet} ${orientationNames[option.orientation]} 1:${option.scale}`
export function fitMessage(extentM: DrawingExtent, option: SheetOption) {
  if (fits(extentM, option)) return undefined
  return `O ambiente não cabe em ${option.sheet}${fits(extentM, { ...option, orientation: option.orientation === "portrait" ? "landscape" : "portrait" }) ? ` ${orientationNames[option.orientation]}` : ""} na escala 1:${option.scale}.`
}
