import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import RoomEditor from '../../src/RoomEditor'
import WorkspaceHeader from '../../src/WorkspaceHeader'
import { UnitContext } from '../../src/Measurement'
import { ENVIRONMENT_SECTIONS, nextEnvironmentSection, sectionForIssue } from '../../src/environmentNavigation'
import { buildRoomGeometry } from '../../src/roomGeometry'
import { UndoHistory } from '../../src/undo'
import { opening, project, roomFrom } from '../etapa11/helpers'
import type { ChecklistIssue } from '../../src/checklist'

describe('Etapa 19 — categorias preservam os dados de campo', () => {
  it('exibe somente a categoria ativa, com todos os módulos acessíveis', () => {
    const room=roomFrom('Sala',[3.75,2.8,3.75,2.8]); room.notes='Conferir revestimento';
    opening(room,{label:'P01',type:'door'}); const original=structuredClone(room), survey=buildRoomGeometry(room), p=project([room]);
    for(const section of ENVIRONMENT_SECTIONS) {
      const html=renderToStaticMarkup(<UnitContext value="m"><RoomEditor room={room} survey={survey} project={p} section={section.id} relatedRooms={[]} onChange={()=>{throw new Error('Navegação não pode alterar medidas')}} onNavigate={()=>{}} photosPanel={<p>Galeria independente</p>} reportPanel={<p>Exportações disponíveis</p>}/></UnitContext>);
      expect(html.match(/role="tab"/g)).toHaveLength(9);
      expect(html.match(/role="tabpanel"/g)).toHaveLength(1);
      expect(html.includes('Próxima parede')).toBe(section.id==='perimeter');
      expect(html.includes('Mostrar parede')).toBe(section.id==='openings');
      expect(html.includes('Observações gerais')).toBe(section.id==='summary');
      expect(html.includes('Galeria independente')).toBe(section.id==='photos');
      expect(html.includes('Exportações disponíveis')).toBe(section.id==='report');
    }
    expect(room).toEqual(original);
  });
  it('o fluxo volta ao resumo e pendências abrem a categoria correta', () => {
    let section:typeof ENVIRONMENT_SECTIONS[number]['id']='summary';
    const seen=[];
    for(let i=0;i<8;i++){seen.push(section);section=nextEnvironmentSection(section)}
    expect(seen).toEqual(['summary','perimeter','openings','internal','objects','photos','checklist','issues']);
    expect(section).toBe('summary');expect(nextEnvironmentSection('report')).toBe('summary');
    const room=roomFrom('Sala',[4,3,4,3]), door=opening(room,{label:'P01',type:'door'});
    const issue=(elementId:string,field:string):ChecklistIssue=>({id:'issue',roomId:room.id,elementId,field,description:'Conferir',kind:'automatic'});
    expect(sectionForIssue(room,issue(room.id,'ceilingHeightM'))).toBe('summary');
    expect(sectionForIssue(room,issue(room.id,'geometry'))).toBe('perimeter');
    expect(sectionForIssue(room,issue(room.walls[0].id,'lengthM'))).toBe('perimeter');
    expect(sectionForIssue(room,issue(room.corners[0].id,'angleDegrees'))).toBe('perimeter');
    expect(sectionForIssue(room,issue(door.id,'widthM'))).toBe('openings');
  });
  it('desfazer e refazer preservam estados, e uma nova edição descarta o futuro', () => {
    const initial={length:3.750123}, edited={length:4.2}, history=new UndoHistory<typeof initial>();
    history.record(initial,0);expect(history.undo(edited)).toBe(initial);expect(history.redoSize).toBe(1);
    expect(history.redo(initial)).toBe(edited);expect(history.undo(edited)).toBe(initial);
    history.record(initial,2000);expect(history.redoSize).toBe(0);expect(history.redo(initial)).toBeUndefined();
    history.clear();expect(history.size).toBe(0);expect(history.redoSize).toBe(0);
  });
  it('reúne contexto, salvamento, tema e histórico no topo', () => {
    const noop=()=>{};
    const html=renderToStaticMarkup(<WorkspaceHeader projectName="Casa X" roomName="AMB-004 — Cozinha" theme="dark" onThemeChange={noop} onUndo={noop} onRedo={noop} undoCount={1} redoCount={0} onPhotos={noop} onIssues={noop}>Salvo</WorkspaceHeader>);
    expect(html).toContain('Casa X');expect(html).toContain('AMB-004 — Cozinha');expect(html).toContain('Salvo');
    expect(html).toContain('aria-label="Refazer"');expect(html).toContain('Escuro');expect(html).toContain('Sistema');
  });
});
