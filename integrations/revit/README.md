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

## Caminho lembrado

Importar/Atualizar LAC guarda o caminho do JSON e a assinatura dos dados após uma operação bem-sucedida, nas preferências locais do pyRevit, por ID do projeto Revit. Atualizar procura esse arquivo novamente. Se não existir, estiver inválido ou não houver alteração nos dados do modelo, oferece Escolher outro arquivo ou Cancelar. Cancelamentos e falhas não marcam o arquivo como atualizado. Exporte sobrescrevendo o mesmo JSON para usar esse fluxo. Não há monitoramento automático em segundo plano.

## Cotagem automatica de paredes (Revit 2026.1)

Novo comando: LAC > Levantamento > Cotar paredes. Selecione previamente uma ou varias paredes ou selecione apos acionar o comando. Escolha Comprimento, Espessura ou Comprimento + Espessura (padrao). Use o tipo atual do Revit ou selecione um tipo linear existente; nao cria nem modifica estilos.

Funciona em plantas de piso, forro e estrutural. O eixo vem de LocationCurve; as faces sao extraidas com ComputeReferences e Options.View. Comprimento usa faces extremas perpendiculares ao eixo; espessura usa as faces de acabamento Interior/Exterior do HostObjectUtils, sem descontar camadas. Usa NewDimension e referencias reais, sem linhas de detalhe ou medidas escritas como texto.

Afastamento inicial: 8 mm na folha, convertido pela escala da vista. O comando usa o lado exterior indicado pela parede e acrescenta faixas quando encontra obstaculos, ate 16 tentativas. Espessura fica junto a uma extremidade, do lado de fora do comprimento. Evita paredes, cotas, textos e tags por uma aproximacao geometrica; ocupacao de texto, recortes nao retangulares e anotacoes complexas podem exigir ajuste manual. Cotas podem ser movidas normalmente no Revit.

Ignora curvas, eixos fora do plano e paredes sem referencias validas na vista. Encontros unidos/chanfrados podem nao fornecer faces extremas perpendiculares: nesse caso informa a impossibilidade em vez de cotar a abertura como comprimento. Cada cota tem sua transacao; falhas ficam no relatorio sem cancelar as demais. As transacoes sao agrupadas para um unico Desfazer. Referencias ja cotadas na vista sao ignoradas mesmo quando a ordem esta invertida.

### Testar no Revit

1. Recarregue pyRevit; abra uma planta de um projeto de teste.
2. Selecione paredes retas horizontais, verticais e a 45/82 graus, preferencialmente com extremidades livres. Inclua uma curva.
3. Acione Cotar paredes com o modo padrao: confira comprimento paralelo e espessura perpendicular, ambos nativos.
4. Altere comprimento/espessura da parede e confira a atualizacao associativa. Nenhuma medida e substituida pelo comando.
5. Execute novamente: nao deve criar cotas duplicadas. Experimente os modos separados e outro tipo linear existente.
6. Inclua parede com extremidades unidas sem faces validas, parede oculta e vista 3D: confira os avisos e a preservacao das cotas validas.
7. Confira em vista rotacionada, escalas diferentes e recorte ativo; verifique posicionamento e ajuste manual de casos congestionados.

Testes locais: `python integrations/revit/tests/test_dimensions.py` valida direcoes, modos, falta de referencias, colisao e chave de duplicacao com objetos simulados. Nao substitui testes dentro do Revit. Nao ha .sln/.csproj; a extensao Python e compilada/analisada sintaticamente. `npm run build` valida o site existente.

API: https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/475aab91-19d3-5884-d3eb-18dfc0d4004f.htm

### Paredes unidas e encontros angulares

O comando agora tenta GetEndPointReference do LocationCurve (sem presumir validade), depois faces de extremidade e referencias de arestas originais extraidas na vista com ComputeReferences. Pode combinar referencias diferentes nas extremidades. Cada par e validado criando a cota em uma transacao: verifica referencias disponiveis e valor geometricamente coerente. Tentativas recusadas sao revertidas; a proxima alternativa e testada antes do aviso final. Nao usa ValueOverride, linhas auxiliares, unjoin ou edicao de paredes.

Para conjuntos de tres ou mais paredes retas, o afastamento de comprimento e orientado para longe do centro do conjunto selecionado; em poligonos concavos essa heuristica e a busca de espaco podem exigir mover algumas cotas manualmente.

Teste no Revit com poligono fechado irregular e unioes angulares, incluindo 45/82 graus. Confirme cotas de comprimento e espessura, ausencia de duplicacoes na segunda execucao, alteracao associativa apos editar paredes e preservacao das unioes. Pontos do eixo sem referencias nativas e encontros sem arestas utilizaveis ainda podem ser recusados. O relatorio informa o numero de alternativas e o motivo. As referencias reais, especialmente em paredes com perfil editado ou geometria recortada, so podem ser confirmadas dentro do Revit.
