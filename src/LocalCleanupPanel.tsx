import { appCachePrefix } from './releaseChannel'
import { useState } from 'react'
import type { WorkspaceData } from './storage'
import { id } from './domain'
import { ensureProjectMetadata } from './projectMetadata'
import { photoFileIds } from './photos'
import { queuePhotoDeletion } from './photoStorage'
async function clearAppCaches(){if(!('caches' in window))return 0;const keys=(await caches.keys()).filter(key=>key.startsWith(appCachePrefix));await Promise.all(keys.map(key=>caches.delete(key)));return keys.length}
export default function LocalCleanupPanel({workspace,onReset}:{workspace:WorkspaceData;onReset:(data:WorkspaceData)=>void}) {
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 async function clearCache(){setBusy(true);try{await clearAppCaches();setMessage('Cache do LAC limpo neste navegador. Os projetos foram preservados.')}catch{setMessage('Não foi possível limpar o cache neste navegador.')}finally{setBusy(false)}}
 async function reset(){if(!window.confirm(`Zerar todos os ${workspace.projects.length} projeto(s) deste navegador, incluindo seus ambientes, fotos e vínculos? Use esta ação somente para descartar os projetos de teste. A exclusão é definitiva.`))return;setBusy(true);try{const project=ensureProjectMetadata({id:id(),name:'Novo projeto',floors:[],relationships:[]});for(const fileId of photoFileIds(workspace.projects))queuePhotoDeletion(fileId);onReset({projects:[project],projectId:project.id,floorId:'',roomId:''});await clearAppCaches();setMessage('Projetos zerados e cache do LAC limpo. Aguarde o indicador Salvo antes de fechar a página.')}catch{setMessage('A limpeza não foi concluída totalmente. Verifique o status de salvamento e tente limpar o cache novamente.')}finally{setBusy(false)}}
 return <details className="local-cleanup"><summary>Limpar projetos de teste e cache</summary><p>Esta ação afeta somente os dados do LAC neste navegador e neste endereço. Outros navegadores e aparelhos possuem armazenamento separado.</p><button disabled={busy} onClick={clearCache}>Limpar somente cache do LAC</button><button disabled={busy} onClick={reset}>Zerar todos os projetos de teste e limpar cache</button>{message&&<p role="status">{message}</p>}</details>
}
