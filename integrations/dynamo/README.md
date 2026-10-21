# Rotinas LAC para Dynamo · Revit 2027.1

Dois arquivos independentes para Dynamo 4.0.2 / PythonNet3, versão identificada
na instalação deste computador. O Python fica incorporado nos `.dyn`: não é
necessário instalar o pyRevit nem copiar os fontes junto dos arquivos.

## Como abrir

1. No Revit, abra o projeto e uma planta de pavimento com nível associado.
2. Acesse **Gerenciar → Dynamo → Abrir** e escolha um dos arquivos abaixo.
3. Mantenha a execução em **Manual**. Altere o nó **Executar** para **True**
   e clique em **Executar**. As opções aparecem em uma janela.
4. Para repetir, execute uma vez com **False**, volte para **True** e execute.
5. Os resultados e avisos ficam na saída `OUT` do nó Python. Para hidrantes,
   habilite a prévia geométrica de fundo do Dynamo.

Para analisar sem criar elementos, escolha **Somente proposta**. A inserção
e as cotas usam grupos de transações nativas, desfeitos pelo comando Desfazer.
As rotinas não salvam o `.rvt` automaticamente.

## LAC_Hidrantes_Layout.dyn

- Escolha o próprio projeto ou uma instância de vínculo arquitetônico carregada
  e visível. Coordenadas do vínculo são transformadas para o projeto PPCI.
- Escolha a fase arquitetônica; o pavimento vem do nível da vista ativa.
- O limite inicial é **30 m por caminhamento**, configurável por projeto.
  Não representa distância em linha reta, distância entre hidrantes ou raio
  de um círculo. Não soma alcance de jato à cobertura da mangueira.
- Os ambientes precisam estar posicionados, delimitados e na fase escolhida.
  As paredes visíveis são obstáculos; portas com hospedeiro e largura válidos
  formam passagens. Janelas não são usadas como passagens.
- A saída padrão é **Marcadores genéricos leves no Revit**, sem carregar RFA nem
  consultar a lista de famílias. Após a análise e confirmação, cria referências
  azuis na categoria **Modelos genéricos**, identificadas H-P001, H-P002 etc.
  O código fica nos parâmetros Nome/Marca e a finalidade fica em Comentários.
  Vocês podem usar os pontos como referência para posicionar a família definitiva.
- Cada marcador é um sólido simples de 16 × 16 cm e 1,50 m de altura gráfica,
  começando 2 cm acima do nível para aparecer na planta usual e no 3D. Essas
  dimensões não representam o equipamento real. Não cria materiais nem carrega
  famílias. A visibilidade depende da categoria e da faixa de vista da planta.
- Marcadores próprios a até 0,50 m, no mesmo nível/fase, são reconhecidos pela
  posição atual e não duplicados. Os próprios marcadores são ignorados como
  obstáculos nas execuções seguintes. Outros modelos genéricos continuam sendo
  considerados. Não apaga nem reposiciona referências de propostas antigas.
- Pilares, modelos genéricos e, opcionalmente, móveis/equipamentos são obstáculos.
  Suas caixas envolventes são conservadoras; podem bloquear passagens que existem
  na realidade. Portas sem largura reconhecida permanecem bloqueadas.
- Selecione pelo lado interno da entrada principal. A primeira posição sugerida
  é a candidata acessível mais próxima dessa entrada; as demais atendem células
  ainda descobertas. A distribuição é heurística, sem garantia de número mínimo.
- A saída mostra posições e percursos críticos na prévia do Dynamo, sem criar
  linhas permanentes no Revit. Consulte `posições_m`, `rotas_m`, `uncovered`,
  `disconnected`, `avisos`, fase, endereço e demais dados do relatório.
- A opção alternativa **Proposta e inserir família após confirmação** pede o
  tipo real de hidrante carregado, a altura e a
  confirmação da proposta. Famílias baseadas em nível são aceitas. No projeto
  próprio também são aceitas famílias hospedadas em parede. Para vínculo,
  famílias hospedadas em parede não são aceitas; use uma família baseada em
  nível. Famílias de face, de linha ou em múltiplos níveis exigem adaptação.
- A altura inicial de 1,20 m é somente um parâmetro de inserção, não uma
  certificação da altura exigida pela norma ou pela família utilizada.
- Instâncias existentes do mesmo tipo a menos de 0,50 m da posição final não
  são duplicadas. Hidrantes existentes em outros pontos não entram na otimização;
  a rotina não move nem exclui instâncias de execuções anteriores.
- A inserção é bloqueada quando há células sem cobertura, áreas desconectadas
  ou ambientes que não puderam ser lidos. Restrinja a análise a um pavimento.

### Precisão e limites

Análise **2D**, com grade conservadora de 0,25 m inicialmente. Faixas junto às
bordas, espaços menores que a grade, locais sem ambientes e objetos ocultos ou
não modelados precisam de revisão. O relatório de células atendidas não certifica
todos os pontos físicos da edificação. Escadas, mezaninos e atendimento entre
pavimentos não são calculados.

Paredes curvas usam caixas conservadoras e não recebem posições candidatas.
Portas de famílias especiais podem precisar de adaptação dos parâmetros de largura.
Vínculos aninhados, CAD e nuvens de pontos não são interpretados como layout.
Paredes no próprio PPCI, quando a arquitetura está vinculada, são obstáculos
conservadores e suas portas não são abertas automaticamente.

A análise tem limites de 60 mil células, 80 candidatos e 2 milhões de associações
de cobertura. Ela interrompe e pede uma área menor se exceder esses limites;
não aumenta a resolução silenciosamente. A janela de progresso permite cancelar
durante o cálculo dos percursos. O cálculo continua na thread do Revit e pode
ocupar a interface temporariamente durante a leitura/rasterização.

**É uma proposta geométrica para revisão técnica.** Não dimensiona vazão,
pressão, reserva de incêndio, tubulação, simultaneidade ou bomba. Não aplica
automaticamente uma legislação estadual a partir do endereço: dados cadastrais
não identificam com segurança a regra aplicável. O limite e a regra de atendimento
devem ser conferidos pelo responsável técnico em cada projeto.

Referências para distinguir a lógica geométrica das exigências regulamentares:
[CBMRS — resoluções técnicas](https://bombeiros.rs.gov.br/resolucoes-tecnicas).
Não se presume que todos os projetos futuros estejam no mesmo estado.

## LAC_Cotas_Gerais.dyn

- Padrão: **todas as paredes visíveis da vista ativa**, cada uma com sua cota de
  comprimento. Também é possível selecionar apenas algumas paredes.
- Composição alternativa: **Externas + trechos principais**. Cria extensões gerais
  do conjunto e cotas encadeadas, agrupadas pelas direções das paredes. O trecho
  principal mínimo é ajustável, inicialmente 1 m. As extensões externas vêm das
  referências geométricas extremas, não do parâmetro cadastral “parede externa”.
  Não é uma classificação topológica completa de fachadas, pátios e reentrâncias.
- Fonte: projeto próprio ou uma instância de vínculo carregada e visível.
- Paredes retas, inclusive diagonais, seguem sua geometria. Paredes curvas e
  referências incompatíveis são ignoradas com aviso.
- Escolha um tipo linear carregado ou o padrão do Revit. O afastamento é em
  milímetros no papel e acompanha a escala da vista; padrão 8 mm.
- Cotas nativas, associativas e editáveis. Reutiliza a busca de referências de
  extremidades, faces e arestas do plugin existente. Não altera uniões, não cria
  linhas auxiliares e não utiliza substituição de texto para simular medidas.
- Referências já cotadas na vista não são repetidas. A criação é validada pela
  medida resultante; tentativas inválidas são revertidas individualmente.
- Amplie ou desative o recorte da planta se as cotas externas ficarem fora dele.
  Cotas densas, textos e cantos de plantas irregulares ainda podem exigir ajuste
  gráfico manual. “Todas” inclui paredes internas; use a segunda opção para
  reduzir a densidade. Não inclui cotas de espessura, vãos, esquadrias ou pilares.

## Teste dentro do Revit

1. Em um arquivo de teste com duas salas e uma porta de comunicação, rode os
   hidrantes em **Somente proposta**. Confira que o percurso passa pela porta.
2. Feche a passagem no modelo ou use uma fase em que ela não existe. A outra sala
   deve aparecer desconectada. Teste também um obstáculo obrigando um desvio.
3. Confira escala/unidades, localização do vínculo rotacionado e fase/pavimento.
4. Revise as posições; teste **Marcadores genéricos leves no Revit** sem família
   carregada. Confira as posições, os códigos e a visibilidade em planta/3D.
   Repita: os marcadores existentes devem ser reaproveitados e ignorados como
   obstáculos. Se quiser usar o modo família, confira hospedeiro,
   orientação e altura, especialmente famílias hospedadas em parede.
5. Execute novamente: instâncias idênticas próximas não devem ser duplicadas.
6. Rode cotas em um retângulo com paredes internas e depois em uma planta diagonal.
   Compare as duas composições, altere uma parede e confira a atualização nativa.
7. Teste cotas de vínculo, estilo escolhido, recorte e repetição da execução.

Verificações locais: compilação sintática dos scripts incorporados, estrutura e
conexões dos grafos e testes do algoritmo de caminhamento. **Os arquivos ainda
precisam ser executados no Dynamo hospedado no Revit**, especialmente a criação
dos marcadores/instâncias e a aceitação de referências para as cotas.

## Manutenção

Os fontes `.py` permitem ajustes sem editar grandes campos JSON. Após editar:

```
python build_graphs.py
python -B -m unittest discover -s . -p "test_*.py" -v
```

`build_graphs.py` incorpora as funções geométricas do comando existente
`Cotar paredes.pushbutton/script.py`, sem executar/importar a interface pyRevit.
Nenhum comando existente do plugin ou funcionalidade do site é modificado.
