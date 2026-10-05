# Campo — Levantamento arquitetônico

Estrutura inicial em React, TypeScript e Vite. Interface em português, com projetos, pavimentos, ambientes e subambientes independentes.

## Etapa 19 — organização por categorias

O ambiente agora abre em Resumo, com acesso rápido a Perímetro, Aberturas, Elementos internos, Objetos, Fotos, Checklist, Pendências e Relatório. O botão de próximo módulo percorre o fluxo e retorna ao Resumo. As aberturas podem ser filtradas por tipo e parede; fotos possuem filtros rápidos e a pesquisa existente. Atalhos do croqui e das pendências abrem a categoria do elemento.

O topo persistente reúne projeto/ambiente, salvamento, desfazer/refazer, ações globais e tema Claro/Escuro/Sistema. A identidade usa azul-marinho, amarelo nos detalhes e superfícies escuras sem preto absoluto. O croqui permanece à direita no desktop e como miniatura expansível no celular; controles completos aparecem ao expandir.

As medidas, IDs, relações, fotos, backups, PDF, autosave e funcionamento local foram preservados. Outros elementos internos continuam usando o cadastro genérico de objetos existente; nenhum novo modelo técnico foi adicionado. Observações gerais opcionais são compatíveis com o schema 4.

Componentes principais: WorkspaceHeader, EnvironmentTabs, EnvironmentIssuesPanel e RoomEditor; navegação centralizada em environmentNavigation.ts e estilos em theme.css/workspace.css.

## GitHub e publicação

Compatibilização em 05/10/2026: as propostas #1, #2 e #3 foram integradas preservando seu histórico e os recursos locais da etapa 14. Os conflitos em dependências, tema, testes, croqui, formulários, relatórios e exportações foram resolvidos mantendo as implementações mais completas. `npm test` passou nas suítes locais e nos 67 testes do Vitest; `npm run build` passou. O teste de integração do servidor depende de `TEST_DATABASE_URL` e não foi executado nesta validação. No GitHub Pages, o aplicativo continua local, sem ativar login ou sincronização com servidor.

Código: https://github.com/jeanrocha-15/levantamento-arquitetonico (repositório público).

Aplicação: https://jeanrocha-15.github.io/levantamento-arquitetonico/

O workflow “Verificar aplicação” executa testes e build após envios para main/dev e em pull requests. O Vite gera caminhos relativos para os arquivos de produção, permitindo hospedar o resultado em uma subpasta.

O workflow “Publicar aplicação no GitHub Pages” pode ser executado manualmente em Actions para publicar atualizações da branch main. Pages utiliza GitHub Actions como origem. A publicação serve somente a aplicação; projetos salvos continuam locais ao navegador de cada pessoa.

## Executar localmente

```sh
npm install
npm run dev
```

## Validar e gerar produção

```sh
npm run build
npm test
npm run preview
```

## Rodada de campo: croqui, PDF em escala, arquivo do projeto, tema e conflitos (etapas 12–18)

O croqui permite aproximar e arrastar o fundo com o mouse. Ative **Mover** para arrastar a visualização também sobre paredes, objetos e rótulos sem editá-los; desative para voltar à seleção e edição. No celular, expanda o croqui para usar zoom e movimento. **Tamanho dos rótulos** oferece 50%, 75%, 100%, 125% e 150%, por ambiente, com persistência local. A alteração afeta os textos do croqui e do relatório visual, sem modificar dimensões, posições ou a escala física do PDF. O funcionamento padrão permanece em IndexedDB e cache offline; os módulos de PostgreSQL e sincronização continuam preparados, mas só são ativados quando a aplicação é servida pelo servidor opcional configurado.

- **Encontros:** cantos novos nascem em **Automático**; um único aviso no topo lista os encontros sem dados (com "Presumir 90°"), e cada canto tem atalhos de um toque — **📏 Medir diagonal** (cria a diagonal e leva ao campo) e **✎ Informar ângulo**.
- **Croqui:** tocar numa parede ou abertura leva ao campo dela; **pinça com dois dedos** aproxima e, com zoom, um dedo arrasta (botões ＋/－ e ⤢ para voltar); **cotas** da distância do canto até a abertura; objetos podem ser **arrastados** (com o mouse, ou com o dedo depois de selecionados), gravando a nova posição ao soltar.
- **Aberturas:** vista da parede "de dentro" com cotas de **peitoril**, altura, largura e distância ao canto; porta sem sentido de abertura gera a pendência "sentido de abertura não informado".
- **Desfazer:** botão "↶ Desfazer" no cabeçalho e Ctrl+Z (fora de campos de texto). Alterações rápidas viram um passo; incluir/excluir fotos reinicia o histórico para nunca deixar foto sem arquivo.
- **Renomear:** projeto e pavimento pelo ⋯ do próprio item (edição ali mesmo); ambiente e subambiente só pelo campo "Nome do ambiente".
- **Unidades (etapa 12):** exibição em mm/cm/m por projeto; o armazenamento continua em **metros** (decisão do projeto, já coberta por `units.mjs`) e `convertMeasurement` converte entre unidades sem ruído binário.
- **Arquivo do projeto (etapa 15):** "Exportar projeto com fotos (.levantamento)" gera um ZIP com `project.json` (mesmo envelope e `schemaVersion` do armazenamento local, com tudo do projeto e os metadados das fotos) e `photos/` (originais e miniaturas). Ao importar, o arquivo é validado antes de qualquer gravação; se o projeto já existir, escolha **Importar como novo** (IDs novos e consistentes, displayIds iguais) ou **Substituir existente** (com confirmação).
- **Tema (etapa 16):** Claro / Escuro / Sistema (segue `prefers-color-scheme`), salvo no aparelho; todas as cores estão em variáveis CSS (`src/theme.css`); fotos nunca recebem filtro; campos inválidos também mudam de borda (não só de cor). A impressão usa sempre o tema claro.
- **PDF em escala real (etapa 17):** em "Exportar e importar", escolha A3/A2, retrato/paisagem e 1:20, 1:25, 1:50, 1:75 ou 1:100. O desenho nunca é ajustado à página: se não couber, o app avisa ("O ambiente não cabe em A3 na escala 1:20.") e sugere combinações que cabem. A prancha traz projeto, pavimento, AMB-ID, nome, pé-direito, escala, data, paredes com comprimentos e espessura em escala, ângulos, portas, janelas, PI, objetos, barra gráfica 0—1—2—3 m e o rodapé de impressão em 100%. PDF vetorial gerado no próprio app (`src/pdf/`), sem dependências.
- **Sincronização (etapa 18, servidor opcional):** estados "Salvo localmente / Sincronizando... / Sincronizado", fotos sincronizadas com o servidor e conflitos entre aparelhos sempre visíveis, com escolha (ver `server/README.md`).

## Fotos de levantamento — etapa 14

O painel **FOTOS** permite tirar foto com `capture="environment"` ou selecionar uma ou várias imagens da galeria/arquivos. Toda foto pertence a um ambiente e pode ser vinculada ao ambiente em geral, parede externa, porta, janela, vão, parede interna ou objeto. Os editores desses elementos oferecem **Adicionar foto** e a contagem de fotos vinculadas. Vínculos usam UUIDs e acompanham renomeações.

A pesquisa considera ID/nome do ambiente, identificação e nome do elemento, tags, observação e nome original do arquivo. P01 e OBJ-001 são encontrados sem criar tags manuais. Há filtros de ambiente, tipo de elemento e presença de vínculo. Tags podem ser separadas por vírgula, ponto e vírgula ou quebra de linha; são confirmadas ao sair do campo. As miniaturas são exibidas em lotes de 24, e o arquivo original só é carregado ao abrir a imagem.

O schema 4 prepara coleções de fotos em projetos anteriores sem modificar medidas ou IDs. O IndexedDB passa à versão 2 e acrescenta o armazenamento `photoFiles`, preservando o armazenamento `workspace`. Metadados ficam nos ambientes; o original e a miniatura JPEG de até 400 px ficam como Blobs separados. Imagens não são gravadas em localStorage nem enviadas ao GitHub ou a um servidor. Fotos e projetos permanecem locais a cada navegador/dispositivo/origem.

Excluir uma foto exige confirmação; seus Blobs são removidos na mesma transação que salva os metadados atualizados. Excluir somente um elemento conserva a fotografia como sem vínculo. Excluir um ambiente/pavimento/projeto também remove os arquivos de suas fotos após salvar a exclusão. Erros de formato ou armazenamento são exibidos, e os demais dados permanecem editáveis.

Verificação: `npm test` executa onze suítes. `tests/photos.mjs` cobre busca e filtros, renomeação, desvinculação, preservação de medidas, migração de schemas/banco, Blobs separados, reabertura e exclusão de arquivos. `fake-indexeddb` é utilizado apenas nos testes. A interface foi verificada em largura mobile pela rede local, com botões de captura grandes e mini croqui persistente; a câmera física precisa ser validada no celular. Não há backup/exportação nesta etapa.

## Croqui: rótulos realocáveis, ângulos automáticos e portas

- **Rótulos realocáveis**: com o mouse, arraste qualquer rótulo do croqui (medidas das paredes, J01/P01, PI01, ângulos, cantos, diagonais, entrada e pé-direito). No celular, toque em **Ajustar rótulos** e arraste com o dedo (setas do teclado também movem; Delete restaura). A posição fica salva por item em `room.labelOffsets` (deslocamento sobre a posição automática), entra no IndexedDB, no backup JSON e na sincronização. **Restaurar** volta um rótulo; **Restaurar todos** volta o croqui inteiro. O posicionamento automático também passou a evitar sobreposição por área (ex.: J01 sobre a medida da parede C).
- **Pé-direito**: aparece no croqui ("Pé-direito 2,80 m"); os campos de medida mostram o padrão brasileiro fora de edição ("2,80"), sem alterar o valor salvo.
- **Encontros entre paredes**: modo **Automático (pela geometria)** — calcula o ângulo pelas diagonais (lei dos cossenos) e, com todas as paredes medidas, pelo fechamento do perímetro (até 3 encontros desconhecidos). Selos **auto** / **manual**; "Sobrescrever manualmente" e "Voltar ao automático". Quando faltam dados, o app diz o quê (comprimento ausente, encontros demais, solução dupla, medidas que não fecham). Ângulos manuais nunca são substituídos.
- **Portas**: tipo *de abrir* (abre para dentro/fora do ambiente, dobradiça à esquerda/direita) ou *de correr* (corre para a esquerda/direita, folha pelo lado de dentro/fora). Esquerda/direita são vistas de dentro do ambiente, olhando para a parede. O croqui desenha o giro com raio igual à largura no lado escolhido, ou a folha de correr com trilho e seta; o relatório e o CSV trazem o funcionamento. Campos não informados aparecem em cinza.

## Servidor opcional: login e sincronização entre aparelhos

A aplicação continua estática e local por padrão. Para usar login, papéis de administrador e usuário, e sincronizar os levantamentos entre aparelhos via PostgreSQL, veja [server/README.md](server/README.md). O servidor entrega o mesmo `dist/` e ativa a sincronização somente nas páginas servidas por ele.

## Quantitativos, relatório e exportações (complemento)

- **Quantitativos por ambiente** (`src/metrics.ts`, quadro abaixo do formulário): área do piso (≈ quando usa ângulo calculado ou fechamento aproximado), perímetro na unidade do projeto, área bruta e líquida de paredes, área de aberturas e volume. Nada é gravado de volta nas medidas; dados ausentes são listados.
- **Selo de completude** no cabeçalho do ambiente ("Em levantamento · 72%" / "✓ Completo"), usando o mesmo checklist da etapa 8.
- **Relatório imprimível/PDF** do projeto (índice com áreas, croqui e tabelas por ambiente, pendências), com comprimentos na unidade do projeto e IDs visuais.
- **Planilha CSV** (separador `;`, decimais com vírgula, valores canônicos em metros) e **backup/importação JSON** de um ou todos os projetos; a importação migra schemas antigos e nunca sobrescreve sem confirmação.

Suítes: `tests/metrics.mjs` e `tests/exporting.mjs`.

## Testes obrigatórios com Vitest e uso offline (PWA) — complemento das etapas 9 a 11

`npm test` executa as suítes `tests/*.mjs` e, em seguida, os **21 testes obrigatórios da etapa 11** com Vitest (`tests/etapa11/`; `npm run test:etapa11` roda só eles). A persistência é testada com IndexedDB simulado (`fake-indexeddb`); o uso no celular tem verificação estrutural automática e roteiro manual em [tests/etapa11/README.md](tests/etapa11/README.md).

Para a obra sem internet, a aplicação pode ser instalada na tela inicial e aberta offline: `public/sw.js` busca a página na rede primeiro e guarda uma cópia; os arquivos do build são servidos do cache. Os dados continuam no IndexedDB. O registro ocorre só no build de produção, em HTTPS ou `localhost`, e funciona no GitHub Pages em subpasta.

Rótulos em metros passam a usar duas casas decimais (`A 4,20 m`, `PI01 1,00 m`), como no padrão das etapas 6 e 10; casas extras digitadas em campo continuam visíveis.

## Objetos, móveis e equipamentos — etapa 13

Cada ambiente possui objetos independentes (`RoomObject`), com UUID estável, ID visual `OBJ-001` etc., nome, categoria, forma, dimensões, centro X/Y, rotação e observação. A numeração é local ao ambiente e seu contador é preservado após exclusões. Fotos poderão usar o UUID posteriormente; não há recursos de fotos nesta etapa.

O formulário aceita retângulo (largura/profundidade), círculo (diâmetro) e segmento (comprimento). Dimensões e posições seguem a unidade do projeto, com metros como unidade canônica. O centro utiliza a origem no início da primeira parede: X no sentido da parede, Y para baixo no croqui. A posição numérica não altera dimensões. Rotação positiva segue o sentido horário do SVG.

Clicar ou usar Enter/Espaço sobre um objeto no SVG destaca o elemento e mostra seu formulário. No mobile, a seleção recolhe o croqui expandido para permitir editar. IDs e dimensões aparecem quando há espaço; elementos pequenos mantêm identificação acessível e título. O enquadramento considera objetos e PIs, alterando apenas a projeção gráfica. Não há arraste, snap ou posicionamento automático.

O schema 3 migra versões 1 e 2 acrescentando a coleção e o contador de objetos, mantendo medidas e referências existentes. Autosave/IndexedDB incluem toda a entidade. Excluir exige confirmação e preserva paredes e demais objetos. A suíte `tests/room-objects.mjs` verifica mesa, botijão, equipamento a 45°, segmento, preservação de medidas entre unidades, IDs, migração, exclusão e armazenamento. `npm test` agora executa dez suítes.

## Unidades, paredes e IDs visuais — etapa 12

O projeto permite selecionar mm, cm ou m. Campos, resumos e croqui acompanham essa escolha, que é salva automaticamente. Conversão, parsing de vírgula/ponto e formatação estão centralizados em `src/units.ts`; os campos usam `src/Measurement.tsx`. Para preservar a precisão dos dados anteriores e os cálculos existentes, a unidade canônica continua sendo metros (`lengthM`, `ceilingHeightM` etc.). Trocar a unidade altera apenas a apresentação, nunca as dimensões armazenadas.

Paredes do perímetro aceitam `thickness` opcional, também em metros canônicos, e `wallType` com identificadores estáveis. “Outro” permite um nome personalizado. A largura gráfica acompanha a espessura na escala do SVG, mantendo as interrupções das aberturas; o croqui continua aproximado.

Cada ambiente e subambiente recebe um `displayId` como `AMB-001`, independente do UUID. Um contador persistente por projeto impede reutilização automática após exclusões. Renomear não altera o ID visual. O schema 2 migra os dados do schema 1 acrescentando metadados e IDs, sem modificar medidas, ângulos ou relações. `tests/units.mjs` verifica conversão, formulário/SVG, migração, persistência, numeração e preservação da geometria. Nenhum recurso das próximas etapas foi acrescentado.

## Revisão e estabilização — etapa 11

O [relatório da etapa 11](RELATORIO-ETAPA-11.md) registra problemas corrigidos, matriz dos 31 testes, responsividade, acesso local, recuperação de erros e limitações. `npm test` executa as oito suítes automatizadas. A etapa mantém os recursos existentes e não implementa Planta Geral.

Corrigidos autosave concorrente em falha, seleção de journal antigo no fallback, validação de elementos malformados e indicação de entrada após exclusão de A. A geometria do ambiente selecionado agora é calculada uma vez e compartilhada por formulário, croqui e checklist. As medidas originais continuam independentes do resultado derivado. O build verifica também imports, variáveis e parâmetros não utilizados.

## Uso em campo e celular — etapa 10

Para acessar pela rede local, execute na pasta do projeto:

```sh
npm run dev -- --host 0.0.0.0
```

Abra no celular, conectado ao mesmo Wi-Fi, o endereço `Network` mostrado pelo Vite. Na verificação desta etapa, o endereço foi `http://192.168.100.5:5174/` (5173 já estava ocupada). O servidor precisa continuar em execução; IP e porta podem mudar. Os projetos pertencem ao navegador e endereço utilizados: o armazenamento do celular é independente do computador, assim como localhost é independente do IP da rede.

O formulário mantém a sequência nome, pé-direito, paredes, aberturas, paredes internas e checklist. Enter no pé-direito inicia as paredes; Enter no comprimento avança para a próxima parede. “Próxima parede” permanece destacado. No mobile, a árvore é recolhível, os controles têm área de toque mínima de 44 px e os campos usam fonte de 16 px. O mini croqui fica fixo e pode ser expandido/recolhido sem perder a edição. No desktop, permanece ao lado do formulário. Vínculos entre ambientes e paredes compartilhadas ficam em seções opcionais recolhidas.

As anotações do SVG procuram posições próximas sem sobreposição, deslocando somente textos. Medidas e geometria original não são alteradas. Geometria e checklist são memorizados para evitar cálculos repetidos em renders de seleção, expansão e status do autosave.

`generateId` centraliza a criação de IDs: prefere `crypto.randomUUID`, usa `crypto.getRandomValues` quando randomUUID não está disponível em HTTP por IP, e possui uma alternativa com timestamp, contador e entropia de sessão para navegadores sem crypto. IDs existentes permanecem intactos. APIs de retenção do navegador são opcionais; se IndexedDB não existir, há armazenamento equivalente em localStorage. Falhas de renderização mostram uma tela simples de recuperação em vez de página em branco.

Verificação: build e testes das etapas anteriores aprovados; `node tests/field-ux.mjs` verifica alternativas de IDs, posições de textos e armazenamento alternativo. No navegador, conferidos 1920×1080, 1366×768, largura 768, 390 e 360 sem rolagem horizontal e com croqui visível. Acesso por localhost e pelo IP HTTP do computador conferido, incluindo autosave e restauração de IDs e medidas. Acesso em celular físico não foi testado.

Os dados são salvos automaticamente neste navegador, em IndexedDB, e restaurados ao reabrir a aplicação no mesmo endereço. Comprimentos são armazenados em metros. Paredes recebem letras sequenciais (A…Z, AA, AB…) sem limite de quatro paredes. Ambos os botões de parede acrescentam a próxima parede e focam seu comprimento.

O SVG desenha cada parede individualmente, com comprimentos, identificação dos cantos e seleção por clique ou teclado. Cada encontro aceita 90° presumido, ângulo interno informado ou ainda não definido. Os valores e suas origens aparecem próximos ao canto no croqui. Ângulos maiores que 180° permitem cantos reentrantes (270° em um ambiente em L). A entrada principal é indicada na parede A, sem desenho de porta. Somente a escala gráfica é ajustada. Se os comprimentos não fecharem, o perímetro permanece aberto e a diferença é informada. O último encontro também é editável e sua orientação é conferida, sem modificar o desenho para fechar.

Trechos sem comprimento positivo usam referência tracejada de 1 m apenas na visualização. Ângulos não definidos ou fora do intervalo 0° < ângulo < 360° usam 90° provisoriamente no desenho, preservando o valor original e indicando a indefinição, quando não houver cálculo por diagonal disponível. No desktop o croqui permanece ao lado do formulário; no celular há uma miniatura fixa expansível.

## Diagonais — etapa 4

Cadastre uma diagonal selecionando dois cantos e informando a distância medida em metros. As diagonais aparecem tracejadas no SVG, com o valor original medido. É possível editar e remover cada registro. Cantos de um perímetro anterior permanecem no registro caso novas paredes mudem sua identificação; a interface avisa e permite selecionar os cantos atuais.

O cálculo utiliza a lei dos cossenos quando a diagonal e duas paredes formam um triângulo. Em um quadrilátero com os quatro comprimentos disponíveis, a diagonal interna divide o ambiente em dois triângulos e permite estimar os quatro ângulos. Trechos maiores também podem estimar um único ângulo desconhecido quando os demais ângulos e comprimentos do trecho são conhecidos. Dados insuficientes, triângulos impossíveis e soluções ambíguas geram avisos, sem impedir a edição.

A diagonal isolada não distingue todas as possíveis configurações do perímetro. A solução usa o ramo convexo nas estimativas triangulares e considera os dois triângulos em lados opostos de uma diagonal interna no quadrilátero; essas hipóteses aparecem no cadastro. Ângulos reentrantes informados continuam tendo prioridade. Não há solver geral de polígonos nem tentativa de ajustar o levantamento para fechar.

Os ângulos calculados aparecem como `≈ 87,4°` e origem `calculado`, somente na geometria de visualização. `Room` contém os dados originais; `buildPerimeter` retorna separadamente `calculations`, cantos de visualização, verificação das diagonais e diferença de fechamento. A edição dos ângulos continua mostrando seus valores originais. Valores informados nunca são substituídos. Estimativas conflitantes não são promediadas: a primeira permanece na visualização com aviso de divergência. Remover ou alterar uma diagonal recalcula a visualização a partir dos dados originais.

Tolerâncias centralizadas em `src/tolerances.ts`: aviso acima de 5 cm de fechamento ou divergência de diagonal, e acima de 1° de diferença angular. O epsilon numérico serve somente para comparações; não altera os dados. Diferenças menores também são mostradas em centímetros com a mensagem de geometria aproximada. No celular, os avisos de fechamento ficam disponíveis no formulário e no croqui expandido. O trecho tracejado entre extremos indica a diferença de fechamento e não é uma parede.

## Aberturas — etapa 5

Cadastre portas, janelas e vãos nos botões correspondentes. Cada ambiente tem sequências independentes: P01, P02…; J01, J02…; V01, V02…. Os identificadores existentes permanecem estáveis; excluir uma abertura não renumera as demais nem reutiliza seu número entre sessões.

Informe largura, altura, parede, canto de referência e distância do canto até a **borda mais próxima** da abertura. Janelas também possuem peitoril. Todos os campos usam metros; o SVG e o resumo mostram as dimensões em centímetros, por exemplo `P01 / 80 × 210 cm / 32 cm de AB` e `J01 / 120 × 100 cm / P=110 cm`. Os cantos disponíveis são apenas os dois extremos da parede selecionada, identificados como início ou final. Trocar a parede solicita a referência correspondente à nova parede, mantendo as dimensões e distância.

O traço da parede é recortado nos intervalos das aberturas. Janelas têm dois traços finos entre as ombreiras; portas e vãos deixam o intervalo livre. Não são presumidos sentido de abertura ou giro de folha. Anotações próximas, com linhas de chamada, identificam cada abertura, suas dimensões e o canto de origem. A posição considera a direção real da parede, inclusive quando houver ângulos informados ou calculados por diagonal.

Aberturas sem largura, distância, referência ou comprimento de parede válidos permanecem no cadastro com avisos e não são posicionadas por suposição. Altura ou peitoril faltantes aparecem como `?` no croqui, quando a posição já puder ser representada. Aberturas fora dos limites e sobreposições também geram avisos, sem alterar as medidas originais. Mudanças no perímetro que invalidem um canto preservam o registro e pedem a seleção de uma referência atual. A geometria e as verificações das aberturas são derivadas, separadas dos dados originais.

## Persistência local e autosave — etapa 9

O banco IndexedDB `campo-levantamentos` guarda toda a estrutura original de projetos em uma transação atômica, incluindo subambientes, cantos, aberturas, diagonais, PIs, pendências, contadores e relações. A última seleção de projeto/pavimento/ambiente também é restaurada. A leitura ocorre antes de liberar a edição: os dados iniciais não sobrescrevem projetos existentes durante a abertura.

O autosave usa debounce de 600 ms, com gravações sequenciais. O cabeçalho mostra “Salvando...” e só mostra “Salvo” após a transação ser concluída. Falhas exibem mensagem e botão para tentar novamente, mantendo as alterações em memória. Ao ocultar ou fechar a página, uma gravação é solicitada imediatamente. Um registro auxiliar síncrono em localStorage protege a edição mais recente durante a espera do debounce; a reabertura usa o registro mais recente e o confirma no IndexedDB. O auxiliar só é removido quando a própria revisão foi gravada, sem apagar uma edição posterior.

O envelope tem `schemaVersion: 1`, `revision` e `savedAt`. A versão está centralizada em `src/storage.ts`; uma versão incompatível ou estrutura incompleta interrompe a abertura sem apagar ou sobrescrever os dados, deixando a base preparada para migrações futuras. Não existe migração destrutiva ou normalização de medidas. O IndexedDB usa cópia estruturada e o registro auxiliar preserva também valores numéricos não finitos e zero negativo, mantendo os dados inválidos disponíveis para conferência.

Excluir projetos, pavimentos, ambientes e aberturas continua sincronizando suas relações antes de persistir. Paredes agora também podem ser removidas com confirmação: referências a paredes/cantos excluídos são limpas nas aberturas, PIs e diagonais, mas suas medidas permanecem para reassociação. Os vínculos de paredes em outros ambientes são limpos com aviso técnico. A nomenclatura de paredes novas evita duplicar rótulos ainda existentes.

Sem o servidor opcional, os dados pertencem ao navegador, perfil e endereço utilizados; `localhost` e `127.0.0.1` são armazenamentos diferentes. A aplicação solicita retenção persistente ao navegador quando disponível. Limpar os dados do site ou usar uma sessão privada afeta a retenção. Para encerrar normalmente, aguarde “Salvo”. Não há backend ou Supabase.

Verificação: `node tests/persistence.mjs`, além dos testes anteriores. No navegador, conferidos atualização da página, atualização imediata durante debounce, fechamento/reabertura da aba, precisão dos valores, IDs, hierarquia, observações, vínculos e renomeação de Cozinha para Cozinha Principal. Não foi necessário reiniciar o computador para esses testes.

Arquivos novos: `src/storage.ts`, `src/autosave.ts`, `src/useLocalWorkspace.ts`, `src/deletions.ts` e `tests/persistence.mjs`. Atualizados: `src/App.tsx`, `src/RoomEditor.tsx`, `src/relationships.ts`, `src/styles.css` e este README.

## Checklist, completude e pendências — etapa 8

O checklist do ambiente recalcula automaticamente nome, pé-direito, comprimentos, suficiência da geometria, fechamento acima das tolerâncias, dimensões e referências de aberturas, peitoril, posição/origem/orientação das PIs e valores/referências de diagonais. Também incorpora avisos de posicionamento, sobreposição e incompatibilidade de medidas. Notas que explicam as hipóteses dos cálculos de diagonais não são consideradas pendências.

A porcentagem é a proporção de campos obrigatórios válidos e da suficiência geométrica, arredondada. Medidas opcionais e conexões entre ambientes não são exigidas. A porcentagem pode chegar a 100% e ainda haver uma medida duvidosa ou uma divergência: o número de pendências permanece visível e o ambiente só aparece como completo quando não há alertas ativos. Cada subambiente tem sua própria avaliação.

Em “Marcar medida ou elemento para conferir”, selecione qualquer elemento ou medida disponível, marque “Conferir no local” ou “Medida duvidosa” e registre uma observação opcional de até 240 caracteres. A marcação aparece junto ao elemento. Em “Gerenciar marcações e avisos técnicos”, é possível marcar como conferida, reabrir ou remover. A mesma marcação ativa para medida e motivo não é duplicada; o registro existente recebe a observação atualizada.

“Pendências do projeto” agrupa pavimentos, ambientes e subambientes, incluindo os completos. Clicar em um alerta abre o ambiente, rola até o elemento e destaca o campo quando identificado; paredes também são selecionadas no SVG. O croqui continua sticky no desktop e como miniatura fixa expansível no celular. Nenhuma pendência bloqueia a edição ou a troca de ambiente.

Referências órfãs, conexões consigo próprio e tipos de elementos incompatíveis geram pendências técnicas. A sincronização limpa os IDs quebrados e guarda o aviso técnico em `Room.pendingItems`, para conferência posterior, sem duplicá-lo a cada edição. Pendências automáticas são derivadas e desaparecem ao corrigir os dados; marcações manuais e avisos técnicos são registros persistidos junto aos ambientes.

Verificação: `node tests/checklist.mjs`, além dos testes das etapas anteriores. Arquivos novos: `src/checklist.ts`, `src/ChecklistPanel.tsx` e `tests/checklist.mjs`. Atualizados: modelos, relações, App, RoomEditor, Sketch, editores de aberturas/PIs/diagonais/cantos, estilos e este README.

## Hierarquia e relações — etapa 7

Cada ambiente registra `floorId` e, quando é subambiente, `parentRoomId`. A árvore permite criar, selecionar, renomear e excluir projetos, pavimentos e ambientes. A exclusão pede confirmação e inclui os descendentes. Subambientes possuem registros e croquis independentes; a hierarquia é exclusivamente organizacional.

Portas e vãos permitem escolher “Leva para” entre os demais ambientes do mesmo projeto, inclusive outros pavimentos, e opcionalmente uma abertura correspondente. Janelas não recebem esses campos. Paredes externas permitem selecionar ambiente e parede compartilhada, sem comparar comprimentos nem alterar medidas. Os seletores mostram o caminho organizacional para distinguir nomes iguais.

`reconcileRelationships` valida referências e sincroniza `opening_connection` e `shared_wall` a cada edição. Os IDs das relações permanecem estáveis durante renomeações e edições. Vínculos são direcionais: não se presume uma conexão inversa. Limpar o destino também limpa a abertura correspondente; excluir somente a abertura de destino preserva o ambiente conectado. Excluir ambientes, descendentes ou pavimentos limpa referências e relações afetadas. Relações consigo próprio e destinos inválidos são descartados. Nenhum vínculo combina ou posiciona croquis.

Verificação: `node tests/relationships.mjs`. Arquivos desta etapa: `src/models.ts`, `src/domain.ts`, `src/App.tsx`, `src/RoomEditor.tsx`, `src/OpeningEditor.tsx`, `src/styles.css` e README; novos `src/relationships.ts`, `src/RoomConnections.tsx` e `tests/relationships.mjs`.

## Paredes internas e relações futuras — etapa 6

Cada ambiente permite cadastrar PI01, PI02… com parede de origem, canto de referência, distância até o início, comprimento, orientação, espessura e altura opcionais e observação. A sequência é independente do perímetro e não reutiliza números removidos. A PI não cria ambientes nem altera paredes externas ou o fechamento.

A orientação é medida no sentido horário em relação ao sentido da parede de origem: 0° acompanha a parede, 90° aponta para dentro de um perímetro horário e 270° aponta para fora. Trocar o canto de referência muda somente a origem da distância. O SVG mostra a PI com identificação e comprimento próximos; o enquadramento considera suas extremidades e ajusta apenas a projeção gráfica. Dados incompletos ou inválidos permanecem registrados com avisos.

Projetos, pavimentos, ambientes, paredes e aberturas usam UUIDs; as novas PIs também. Cantos mantêm IDs derivados do par de IDs das paredes, sem depender dos rótulos visuais. Renomear ambientes ou rótulos não altera referências estruturais. Todos esses identificadores e referências são preservados no armazenamento local.

`Project.relationships` armazena `RoomRelationship` com IDs de origem/destino e os tipos `opening_connection`, `shared_wall`, `adjacency` e `manual_reference`. `Opening` tem os campos opcionais `connectedRoomId` e `connectedOpeningId`; `Wall.sharedWallReference` guarda IDs de ambiente e parede. O modelo de origem de PI prevê parede do perímetro, outra PI ou posição livre, além de referência opcional a uma futura divisão formal. Apenas a origem no perímetro tem interface nesta etapa; as demais relações são preparação de dados.

Verificação de paredes internas e modelos: `node tests/internal-walls.mjs`. Inclui o ambiente 2 × 4 m com PI de 1 m, referências em ambos os extremos, orientações, paredes inclinadas, diagonais, preservação do perímetro e aberturas, enquadramento, IDs estáveis, isolamento entre ambientes e contratos TypeScript.

Arquivos desta etapa: `src/models.ts`, `src/domain.ts`, `src/App.tsx`, `src/RoomEditor.tsx`, `src/Sketch.tsx`, `src/OpeningSketch.tsx`, `src/styles.css` e este README. Novos: `src/internalWalls.ts`, `src/InternalWallEditor.tsx`, `src/InternalWallSketch.tsx`, `src/sketchLabels.ts`, `tests/internal-walls.mjs` e `tests/models.types.ts`.

Verificação da geometria: `node tests/geometry.mjs`. Casos: retangular, pentágono, hexágono, ambiente em L, 45°, 82°, valores indefinidos, cálculo por diagonais, trechos longos, conflitos, triângulos inválidos, dados insuficientes, tolerâncias e preservação dos dados.

Verificação das aberturas: `node tests/openings.mjs`. Casos: referência em ambos os extremos, recorte do traço, paredes inclinadas, portas/janelas/vãos, unidades, dados incompletos, limites, sobreposições, cantos inválidos e preservação dos registros.

Modelos: `src/models.ts`. Organização e nomenclatura: `src/domain.ts`. Identificação e valores dos encontros: `src/corners.ts`. Geometria de visualização: `src/geometry.ts`. Cálculos trigonométricos: `src/diagonals.ts`. Editores: `src/CornerEditor.tsx`, `src/DiagonalEditor.tsx` e `src/OpeningEditor.tsx`. Posicionamento das aberturas: `src/openings.ts`. Renderização das aberturas: `src/OpeningSketch.tsx`. Avisos de fechamento: `src/GeometryStatus.tsx`. Sem backend ou funcionalidades das próximas etapas; armazenamento local implementado na etapa 9.
