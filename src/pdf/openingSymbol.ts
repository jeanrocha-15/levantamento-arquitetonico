import type { PdfPage, Pt } from './pdfWriter'
import type { SymbolPart } from '../openingSymbols'
export function drawOpeningSymbol(page:PdfPage,parts:SymbolPart[],at:(p:Pt)=>Pt){for(const part of parts){if(part.kind==='line')page.line(at(part.a),at(part.b),{width:.2});else page.curve(at(part.a),at(part.c1),at(part.c2),at(part.b),{width:.15})}}
