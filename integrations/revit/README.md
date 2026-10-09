# LAC → Revit 2026.1

Integração inicial via arquivo JSON + Python no pyRevit. O site continua React e não exige servidor.

1. Instale uma versão do pyRevit compatível com seu Revit 2026.1: https://docs.pyrevitlabs.io/
2. Copie a pasta `LAC.extension` para a pasta de extensões do pyRevit (normalmente `%APPDATA%\pyRevit\Extensions`). Recarregue o pyRevit.
3. No LAC, posicione os ambientes na Planta Geral. Preencha espessuras e pé-direito.
4. Em Exportar e importar → Integração Revit, selecione pavimento e informe sua elevação em metros. Exporte LAC-Revit.json.
5. Abra um projeto Revit de teste e clique LAC → Levantamento → Importar LAC. Selecione o JSON e um tipo básico de referência para duplicar.
6. Confirme a importação e confira a vista 3D. Use Desfazer no Revit para reverter.

## Contrato

`format: lac-revit`, `schemaVersion: 1`, `units: m`. Eixos de parede derivados das faces físicas do croqui; aplica RoomPlacement sem escala individual e converte Y da tela para Y cartesiano. No script, metros são convertidos para pés internos do Revit. O JSON também guarda os dados originais, IDs e RoomPlacements sem fotos binárias.

Não inventa elevações, tipos ou alturas. Paredes incompletas e ambientes não posicionados são listados como avisos. Cria tipos LAC com uma camada e a espessura cadastrada, duplicando a referência escolhida. Material é herdado da referência, não inferido pelo nome. Não altera tipos existentes.

Importação em uma transação: falha reverte o lote. IDs registrados nos comentários impedem repetir a mesma parede no mesmo projeto/pavimento. Não edita paredes importadas anteriormente nem faz sincronização bidirecional. Não remova os marcadores LAC dos comentários se quiser manter essa proteção.

## Limites

Recortes de portas/janelas/vãos são criados; famílias, pisos, telhados e objetos não são criados. Confira paredes não colineares antes de usar como modelo definitivo. Compatibilizações de medidas não substituem os dados originais exportados. Croquis aproximados continuam aproximados.

Compilação e contrato podem ser testados fora do Revit; criação real precisa ser validada em Revit 2026.1 com pyRevit instalado. Esta integração não foi executada em um Revit nesta máquina.

Referências: https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/0ce4c555-4cee-f5fd-2e84-43cacf34ac5c.htm e https://docs.pyrevitlabs.io/extensions/

## Atualização: aberturas e paredes coincidentes

A exportação agora exige dados completos; confira o pé-direito de todos os ambientes. Portas/janelas/vãos são recortes retangulares nas posições medidas, sem famílias de folhas e caixilhos. Eixos coincidentes de mesma espessura são consolidados; alturas diferentes preservam a parede mais alta no trecho comum e os trechos exclusivos da menor. Dados originais permanecem separados. Paredes próximas mas não colineares continuam independentes.

Para substituir o resultado antigo, use um projeto Revit limpo ou desfaça a importação antiga antes de importar o novo JSON. Não há atualização automática de elementos existentes.

Pé-direito vazio: padrão presumido 2,50 m. Fechamento Forro (padrão): +0,50 m automático na altura das paredes exportadas. Laje: sem acréscimo. Alturas específicas de PI são preservadas. O valor medido não é substituído; heightAssumptions registra as hipóteses no JSON.

## Atualizar LAC

Exporte um novo JSON no site após alterar o levantamento. No Revit clique Atualizar LAC e selecione esse arquivo. Paredes com os mesmos IDs são atualizadas (geometria, tipo e altura); paredes novas são adicionadas. Recortes vinculados são atualizados/adicionados. A operação é uma transação, revertida se falhar. Não altere os comentários LAC que identificam os elementos.

Não apaga paredes/aberturas ausentes do novo JSON. Mudanças na consolidação podem deixar segmentos antigos: confira e remova manualmente os antigos. Elementos travados interrompem o lote. Famílias de portas/janelas não são criadas. Atualização de níveis para outra elevação permanece bloqueada. O arquivo deve ser exportado novamente: o Revit não acessa o navegador automaticamente.
