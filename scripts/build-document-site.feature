Feature: building a document folio's site

  @test:scripts/build-document-site.test.ts::scaffoldedFolioBuilds
  Scenario: a freshly scaffolded document folio builds: index, one page per document, block anchors intact
    Given a freshly scaffolded document folio
    When the site is built
    Then there are no errors and one document, handbook, titled Handbook
    And the index and the handbook page exist, with the block and chapter anchors
    And the landing links the handbook and the review page, with no block counts

  @test:scripts/build-document-site.test.ts::statusInTitle
  Scenario: a document's status is part of its title: heading, page title and landing list
    Given the handbook's meta status is "Working Draft"
    When the site is built
    Then the title, heading and page title read "Handbook - Working Draft"

  @test:scripts/build-document-site.test.ts::kgNodesPublished
  Scenario: every block's KG node is published, one per block and as the document's graph
    When the site is built
    Then the block's KG node is published on its own and in the document's graph

  @test:scripts/build-document-site.test.ts::editRuntimeAndValues
  Scenario: a one-page document carries the edit-links runtime (✍ suggest) and the site its values.jsonld
    When the site is built with a repository for actions
    Then the page carries the edit configuration, the values link and the suggest runtime
    And values.jsonld is an empty graph

  @test:scripts/build-document-site.test.ts::editorCheckerBundled
  Scenario: an editor-checker profile for the content type is bundled, and the page config names it and the graph
    Given a profile with an editor checker for documents
    When the site is built
    Then the checker module is bundled
    And the page config names the graph and the checker profile

  @test:scripts/build-document-site.test.ts::missingOrStaleKgNodeFails
  Scenario: a block with no KG node, or a stale one, fails the build: the graph is never silently absent
    When the site is built without a block's KG node, and with a stale one
    Then each build fails naming the node and the generator to run

  @test:scripts/build-document-site.test.ts::pagesUnderLocale
  Scenario: pages are under the locale, data is not, and the landing stays at the root (#2527)
    When the site is built lazily
    Then the pages are under en/ and none at the old paths
    And the block data and outline.json are at the root and the outline names the en/ page
    And the shell fetches its blocks from the root

  @test:scripts/build-document-site.test.ts::markdownTableRenders
  Scenario: a Markdown table in a block renders as a <table>, not raw pipes (fz39)
    Given a block with a Markdown table
    When the site is built
    Then the page has a table with the cell and no raw pipes

  @test:scripts/build-document-site.test.ts::outlineInManifestOrder
  Scenario: outline.json lists sections in manifest order, keyed exactly as the ChangeSet keys them (eb4l)
    When the site is built
    Then outline.json is a folio-outline/v1 listing prose:overview
    And its section keys are the ChangeSet's

  @test:scripts/build-document-site.test.ts::noDocumentIsError
  Scenario: a folio with no document is an error, not an empty site
    Given a folio with no document
    When the site is built
    Then the first error says there is no document manifest
    And no index is written

  @test:scripts/build-document-site.test.ts::bodyAndMainAfterStyle
  Scenario: every page's first <body and <main are the real tags, after the style
    When the site is built
    Then on every page the first body and main tags come after the style

  @test:scripts/build-document-site.test.ts::mathClaimedBeforeEmphasis
  Scenario: with math on, an equation is claimed before emphasis and marked for KaTeX
    When prose with inline and display math is rendered with math on
    Then the inline math is marked for KaTeX and display math is present
    And no emphasis is made from the asterisk

  @test:scripts/build-document-site.test.ts::mathOffDollarsStayProse
  Scenario: with math off, a document's dollar amounts stay prose
    When "It cost $5 million and $3 more." is rendered with math off
    Then no math is made and the text is kept

  @test:scripts/build-document-site.test.ts::deftermAndRefterm
  Scenario: :defterm becomes a definition with an id, :refterm links to it
    When prose with :defterm and :refterm is rendered
    Then the defterm is a dfn with an id and the refterm links to it

  @test:scripts/build-document-site.test.ts::otherDirectiveKeptAsText
  Scenario: a directive of any other name is put back as the text it was written as
    When "Ratio note:alpha stays." is rendered
    Then the text is kept as written

  @test:scripts/build-document-site.test.ts::citeOutsideFences
  Scenario: \cite becomes a citation label, but not inside fenced code
    When prose with a \cite and a fenced \cite is converted
    Then the first becomes a citation label and the fenced one is kept

  @test:scripts/build-document-site.test.ts::citedKeysLinkBibliography
  Scenario: given a bibliography, each cited key links to its entry there (bean 63q4)
    When a \cite with a locator is converted with a bibliography URL
    Then each key links its entry and the locator follows

  @test:scripts/build-document-site.test.ts::citationsUnlinkedWithoutBibliography
  Scenario: without a bibliography, citations stay unlinked labels
    When \cite{x} is converted without a bibliography
    Then it is an unlinked label [x]

  @test:scripts/build-document-site.test.ts::renderPassesBibliography
  Scenario: renderDocumentHtml passes the bibliography through
    When prose with a \cite is rendered with a bibliography URL
    Then the key links to /bib/#ref-x

  @test:scripts/build-document-site.test.ts::macroTableFromManifest
  Scenario: the macro table is the viewer's: \name -> tex from the paper manifest
    When the KaTeX macro table is made
    Then the paper manifest's macro is included and the viewer's default \bigbowtie is \bowtie

  @test:scripts/build-document-site.test.ts::splitBlocksKeepsShell
  Scenario: splitBlocks keeps headings and anchors in the shell, never splits inside a fence
    When a page with headings, anchors and a fence is split into blocks
    Then the blocks are prose:a and prose:b, the fence staying inside the first
    And the shell keeps the headings and anchors and a placeholder per block, without block text

  @test:scripts/build-document-site.test.ts::splitBlocksMovesFrameOpener
  Scenario: splitBlocks moves a figure or table frame's opener into its block, so the shell stays balanced
    When a page with a numbered table frame is split
    Then the frame's opener and closer move into the table's block
    And every block's div tags balance

  @test:scripts/build-document-site.test.ts::lazyAlwaysShellChunksHydrated
  Scenario: --lazy always: a shell, chunked block JSON, and the whole text in index.hydrated.html
    When the site is built lazily with actions
    Then the shell has anchors and placeholders but not the block text
    And the chunk and the hydrated page carry the text, edit link and coded feedback
    And the outline records the hydrated page, one chunk and the block's chunk

  @test:scripts/build-document-site.test.ts::autoStaysOnePage
  Scenario: auto stays one page below the threshold
    When the small site is built with defaults
    Then there is no hydrated page and no block data

  @test:scripts/build-document-site.test.ts::pageContentsChaptersRows
  Scenario: chapters are rows, their sections the rows' children, each pointing at the label anchor before its heading
    When the contents of a page with chapters and sections are made
    Then chapters with an anchor are rows and their sections children, each pointing at its anchor
    And a page with no section anchors gives nothing
