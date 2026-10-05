// Gerador mínimo de PDF vetorial (sem dependências). Coordenadas em milímetros com origem no
// canto superior esquerdo da folha; a conversão para pontos (1/72") é feita só aqui, igual em X e Y.
export const PT_PER_MM = 72 / 25.4
export interface Pt { x: number; y: number }
type Font = 'regular' | 'bold'
// Larguras AFM da Helvetica (1/1000 em) para ASCII 32–126; acentuadas usam a letra base.
const WIDTHS = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584]
// WinAnsi para os caracteres não Latin-1 usados nos rótulos.
const WIN_ANSI: Record<string, number> = { '—': 0x97, '–': 0x96, '•': 0x95, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94 }
const SUBSTITUTE: Record<string, string> = { '≈': '~', '→': '->', '↻': '', '⚠': '!', '≤': '<=', '≥': '>=' }
function encode(text: string): number[] {
  const bytes: number[] = []
  for (const char of [...text].map(c => SUBSTITUTE[c] ?? c).join('')) {
    const code = char.codePointAt(0)!
    bytes.push(WIN_ANSI[char] ?? (code < 256 ? code : 0x3f))
  }
  return bytes
}
export function textWidthMm(text: string, sizeMm: number, font: Font = 'regular') {
  const base = (c: string) => c.normalize('NFD')[0]
  const units = [...text].reduce((total, c) => { const code = base(c).charCodeAt(0); return total + (code >= 32 && code <= 126 ? WIDTHS[code - 32] : 556) }, 0)
  return units / 1000 * sizeMm * (font === 'bold' ? 1.06 : 1)
}
const n = (value: number) => (Math.round(value * 1000) / 1000).toString()
export interface StrokeStyle { width: number; gray?: number; dash?: number[] }

export type PdfSection = 'drawing' | 'title' | 'legend' | 'paper'
export type PdfTextOptions = {align?:'left'|'center'|'right';font?:Font;rotate?:number;gray?:number;key?:string}
export type PdfCommand =
 | {kind:'line';a:Pt;b:Pt;style:StrokeStyle}
 | {kind:'polyline';points:Pt[];style:StrokeStyle;close:boolean}
 | {kind:'rect';x:number;y:number;w:number;h:number;style:StrokeStyle & {fillGray?:number;stroke?:boolean}}
 | {kind:'curve';a:Pt;c1:Pt;c2:Pt;b:Pt;style:StrokeStyle}
 | {kind:'circle';center:Pt;r:number;style:StrokeStyle}
 | {kind:'text';at:Pt;text:string;sizeMm:number;options:PdfTextOptions}
export type PdfSceneItem = PdfCommand & {section:PdfSection}

export class PdfPage {
  readonly ops: string[] = []
  readonly scene: PdfSceneItem[] = []
  section: PdfSection = 'drawing'
  private record(command:PdfCommand) { this.scene.push({...command,section:this.section}) }
  constructor(readonly widthMm: number, readonly heightMm: number) {}
  private p(point: Pt) { return `${n(point.x * PT_PER_MM)} ${n((this.heightMm - point.y) * PT_PER_MM)}` }
  private style({ width, gray = 0, dash }: StrokeStyle) { this.ops.push(`${n(width * PT_PER_MM)} w ${n(gray)} G [${(dash ?? []).map(d => n(d * PT_PER_MM)).join(' ')}] 0 d`) }
  line(a: Pt, b: Pt, style: StrokeStyle) { this.record({kind:'line',a,b,style}); this.style(style); this.ops.push(`${this.p(a)} m ${this.p(b)} l S`) }
  polyline(points: Pt[], style: StrokeStyle, close = false) { if (points.length < 2) return; this.record({kind:'polyline',points,style,close}); this.style(style); this.ops.push(`${points.map((pt, i) => `${this.p(pt)} ${i ? 'l' : 'm'}`).join(' ')} ${close ? 'h ' : ''}S`) }
  rect(x: number, y: number, w: number, h: number, style: StrokeStyle & { fillGray?: number; stroke?: boolean }) {
    this.record({kind:'rect',x,y,w,h,style})
    this.style(style)
    if (style.fillGray !== undefined) this.ops.push(`${n(style.fillGray)} g`)
    this.ops.push(`${this.p({ x, y: y + h })} ${n(w * PT_PER_MM)} ${n(h * PT_PER_MM)} re ${style.fillGray !== undefined ? (style.stroke === false ? 'f' : 'B') : 'S'}`)
    this.ops.push('0 g')
  }
  // Curva de Bézier cúbica (arcos de porta, círculos).
  curve(a: Pt, c1: Pt, c2: Pt, b: Pt, style: StrokeStyle) { this.record({kind:'curve',a,c1,c2,b,style}); this.style(style); this.ops.push(`${this.p(a)} m ${this.p(c1)} ${this.p(c2)} ${this.p(b)} c S`) }
  circle(center: Pt, r: number, style: StrokeStyle) {
    this.record({kind:'circle',center,r,style})
    const k = 0.5523 * r, { x, y } = center
    this.style(style)
    this.ops.push(`${this.p({ x: x + r, y })} m ${this.p({ x: x + r, y: y + k })} ${this.p({ x: x + k, y: y + r })} ${this.p({ x, y: y + r })} c ${this.p({ x: x - k, y: y + r })} ${this.p({ x: x - r, y: y + k })} ${this.p({ x: x - r, y })} c ${this.p({ x: x - r, y: y - k })} ${this.p({ x: x - k, y: y - r })} ${this.p({ x, y: y - r })} c ${this.p({ x: x + k, y: y - r })} ${this.p({ x: x + r, y: y - k })} ${this.p({ x: x + r, y })} c S`)
  }
  // Texto com tamanho em mm (altura do corpo); align relativo ao ponto; rotação em graus (sentido horário na folha).
  text(at: Pt, text: string, sizeMm: number, { align = 'left', font = 'regular', rotate = 0, gray = 0, key }: PdfTextOptions = {}) {
    if (!text) return
    this.record({kind:'text',at,text,sizeMm,options:{align,font,rotate,gray,key}})
    const shift = align === 'left' ? 0 : textWidthMm(text, sizeMm, font) * (align === 'center' ? .5 : 1)
    const rad = -rotate * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad)
    const origin = { x: at.x - shift * Math.cos(rotate * Math.PI / 180), y: at.y - shift * Math.sin(rotate * Math.PI / 180) }
    const [px, py] = this.p(origin).split(' ')
    const bytes = encode(text).map(b => b === 0x28 || b === 0x29 || b === 0x5c ? `\\${String.fromCharCode(b)}` : b < 32 || b > 126 ? `\\${b.toString(8).padStart(3, '0')}` : String.fromCharCode(b)).join('')
    this.ops.push(`BT ${n(gray)} g /${font === 'bold' ? 'F2' : 'F1'} ${n(sizeMm * PT_PER_MM)} Tf ${n(cos)} ${n(sin)} ${n(-sin)} ${n(cos)} ${px} ${py} Tm (${bytes}) Tj ET 0 g`)
  }
}

export function buildPdf(input: PdfPage | PdfPage[], title: string): Uint8Array {
  const pages=Array.isArray(input)?input:[input]
  if(!pages.length)throw new Error('Não há folhas para exportar.')
  const objects:string[]=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_,i)=>`${5+i*2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ]
  pages.forEach((page,index)=>{const content=page.ops.join('\n');objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(page.widthMm * PT_PER_MM)} ${n(page.heightMm * PT_PER_MM)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6+index*2} 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  )})
  objects.push(`<< /Title (${encode(title).map(b => b === 0x28 || b === 0x29 || b === 0x5c ? `\\${String.fromCharCode(b)}` : b > 126 ? `\\${b.toString(8)}` : String.fromCharCode(b)).join('')}) /Producer (Campo - levantamento arquitetonico) >>`)
  let out = '%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n'
  const offsets: number[] = []
  objects.forEach((body,index)=>{offsets.push(out.length);out+=`${index+1} 0 obj\n${body}\nendobj\n`})
  const xref=out.length
  out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('')}`
  out+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Uint8Array.from(out,char=>char.charCodeAt(0)&0xff)
}
