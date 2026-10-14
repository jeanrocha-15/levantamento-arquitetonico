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

## Cotar paredes do vinculo (PPCI)

Novo botao separado: LAC > Levantamento > Cotar paredes do vinculo. O botao Cotar paredes continua disponivel para paredes do proprio projeto.

1. Abra uma planta do PPCI com o arquitetonico vinculado e visivel.
2. Selecione a instancia do vinculo previamente ou clique no botao e selecione o vinculo.
3. Marque um ou varios tipos de parede. A lista identifica o tipo e quantas paredes sao visiveis nesta vista.
4. Escolha Comprimento, Espessura ou Comprimento + Espessura (padrao).
5. Use o tipo atual de cota do PPCI ou selecione outro tipo linear existente no PPCI.

A geometria e lida no documento vinculado com referencias calculadas, sem passar uma vista do PPCI para Options.View do outro documento. Reutiliza as alternativas de eixo, faces e arestas do comando existente. GetTotalTransform converte pontos e vetores para o hospedeiro, incluindo espelhamento. CreateLinkReference converte as referencias para a instancia exata. Somente o PPCI recebe transacoes; nao altera o arquitetonico nem copia paredes.

Usa FilteredElementCollector(hostDocument, viewId, linkId), disponivel no Revit 2026.1, para respeitar a visibilidade da instancia. Aplica verificacao adicional aproximada de recorte. Vistas vinculadas, filtros, fases, regioes nao retangulares, paredes inclinadas e referencias de encontros ainda exigem validacao real. O Revit pode incluir elementos parcialmente ocultos no coletor; a verificacao de NewDimension e referencias disponiveis nao substitui uma conferência visual.

Duplicacoes sao verificadas pelas referencias convertidas no documento hospedeiro, incluindo a instancia. Falhas ficam identificadas por ID do vinculo e da parede. Quatorze testes simulados cobrem os dois comandos e o fluxo de revisao, incluindo rotacao, translacao, espelhamento, IDs de duas instancias e falha de conversao. Execute `python -m unittest discover -s integrations/revit/tests -p "test_*dimensions.py"`.

Teste no Revit: arquitetonico deslocado/rotacionado, copia espelhada e duas instancias do mesmo arquivo; confirme cotas paralelas/perpendiculares, tipos filtrados, segunda execucao sem duplicacoes e atualizacao apos editar/recarregar o arquitetonico. Vínculo descarregado deve informar o problema. O vinculo deve permanecer intacto. Mudancas de topologia podem invalidar cotas associativas e precisam de revisao no PPCI.

Referencias API: https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/968b52a0-de55-2f96-de40-968812bc41c7.htm

### Fluxo de revisao e atualizacao do vinculo

O botao Cotar paredes do vinculo agora oferece:

- Previa SVG no painel pyRevit e tabela com paredes/cotas possiveis/avisos, antes de confirmar. A previa e geometrica, sem modificar o modelo; o Revit valida as referencias ao criar as cotas.
- Afastamento de 1 a 100 mm na folha; lado Automatico/Exterior/Interior para comprimento e Inicio/Final para espessura.
- Preferencias locais por documento, vista e instancia: tipos de parede, modo, estilo, afastamento, lado e extremidade.
- Toda a vista ou uma regiao retangular selecionada (paredes que cruzam a regiao).
- Manter cotas validas e reparar quebradas, ou recriar as proprias cotas para aplicar outra posicao/estilo.
- Relatorio com links nativos para cotas/vinculo e lista clicavel de paredes para selecionar e aproximar a vista. Se a selecao da parede vinculada nao for aceita, seleciona a instancia e ainda aproxima a parede.

A substituicao so considera cotas registradas por este comando nas preferencias locais, e troca a antiga pela nova na mesma transacao. Falha na nova cota preserva a antiga. Cotas manuais nao sao apagadas. Cotas de versoes anteriores, criadas antes do registro, podem ser reconhecidas pelas referencias para evitar duplicacao, mas nao sao automaticamente excluidas/reparadas quando quebradas. A restauracao por Desfazer e mudanca de computador pode exigir revisar o registro local; nao e sincronizacao de configuracoes entre usuarios.

Teste: executar com os mesmos tipos em duas vistas/instancias e conferir preferencias independentes; cancelar a previa e verificar que nenhum elemento mudou; limitar a uma regiao; trocar lado/afastamento/extremidade; recarregar o arquitetonico e reparar uma referencia quebrada; escolher atualizar posicao/estilo; confirmar preservacao de cotas manuais; clicar no relatorio para localizar uma parede. Posicionamento automatico em plantas congestionadas e recortes nao retangulares segue aproximado e precisa de conferencia no Revit.

### Selecionar cotas na previa

A previa do comando de vinculo agora abre uma janela WPF interativa. Clique na linha de uma cota ou na lista Parede/Comprimento/Espessura para destaca-la. Controles individuais: incluir na operacao, afastamento em mm na folha, inverter lado e restaurar padrao. Zoom e rolagem ajudam a selecionar cotas pequenas.

As escolhas sao separadas por parede, tipo de cota, vista e instancia; nao alteram medidas nem referencias. Excluir da operacao nao apaga cota existente. Alterar uma cota registrada pelo LAC solicita substituicao somente dela, na mesma transacao da criacao da nova. Ajustes recusados permanecem pendentes para uma proxima tentativa. Cotas manuais nao sao reposicionadas por esse fluxo. Cancelar a janela nao altera o modelo nem salva as alteracoes da selecao.

O desenho e virtual e estimado, nao uma cota nativa ja existente no Revit. Depois de confirmar, a validacao das referencias e a busca de espaco livre podem ajustar a posicao. A janela e os eventos de clique precisam ser validados no pyRevit/Revit real; testes locais verificam os overrides, exclusao, restauracao, pendencias e estrutura XAML.
