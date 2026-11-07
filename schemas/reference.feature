Feature: a bibliographic reference node and its exports

  @test:schemas/reference.test.ts::nodeAtReferencesKey
  Scenario: sits at references/<key>, the IRI \cite already resolves to
    When the IRI of garoufalidis2004 is computed and its JSON-LD made
    Then both are references/garoufalidis2004

  @test:schemas/reference.test.ts::keepsFieldsCslOmits
  Scenario: keeps fields CSL has and its typing omits (series, note, qou's library block)
    When the reference node is read
    Then it keeps its note and its library block

  @test:schemas/reference.test.ts::refusesUncitableKey
  Scenario: refuses a key \cite could not name
    When ids "has space", "a/b", "#x" and "" are validated
    Then each is refused

  @test:schemas/reference.test.ts::cslItemDropsNodeFields
  Scenario: its CSL item drops the node's own fields
    When the node is turned into a CSL item
    Then it has no $schema and no library, keeps its id and its note

  @test:schemas/reference.test.ts::typedFabioWorkAndBibo
  Scenario: typed as a fabio:Work and its BIBO class
    When the node is read as JSON-LD
    Then its types are fabio:Work and bibo:AcademicArticle

  @test:schemas/reference.test.ts::propertiesAreDctermsAndBibo
  Scenario: the properties are dcterms and bibo terms
    When the node is read as JSON-LD
    Then its title, creator, issued and isPartOf are dcterms
    And its volume, pages and doi are bibo

  @test:schemas/reference.test.ts::everyKeyPrefixedOrKeyword
  Scenario: every key is a prefixed term or a JSON-LD keyword
    When the JSON-LD keys are read
    Then each is a JSON-LD keyword or a dcterms, bibo, fabio or schema term

  @test:schemas/reference.test.ts::carriesWhatRecordStates
  Scenario: carries what the record states
    Given the who-iris Dublin Core record of the WHO handbook
    When it is turned into a reference
    Then its title, author, issued date, publisher, ISBN, URL and language are the record's
    And its provenance is catalogue and its type book

  @test:schemas/reference.test.ts::usesDateIssued
  Scenario: uses date.issued, never date.accessioned
    When the reference's year is read
    Then it is 2014

  @test:schemas/reference.test.ts::infersNothingLacking
  Scenario: infers nothing the record lacks
    When the reference is read
    Then it has no DOI, volume, page, container-title or editor

  @test:schemas/reference.test.ts::passesOwnSchema
  Scenario: passes its own schema
    When the reference is validated
    Then it is accepted

  @test:schemas/reference.test.ts::personSplitsOrganisationWhole
  Scenario: names: a person splits on the first comma; an organisation stays whole
    When creator names are turned into CSL names
    Then "Grimm, Jacob Ludwig Karl" splits at the first comma
    And "World Health Organization" stays a literal

  @test:schemas/reference.test.ts::datesYearMonthFullElseRaw
  Scenario: dates: year, year-month, full; anything else raw
    When Dublin Core dates are turned into CSL dates
    Then "2014" and "2014-12" give date parts
    And "c. 1990" is kept raw

  @test:schemas/reference.test.ts::cslToDcWritesContainerLocators
  Scenario: CSL → Dublin Core writes dc.relation.ispartof and dc.citation.*
    Given a journal article in the Bulletin of the World Health Organization
    When it is written as a Dublin Core record
    Then dc.relation.ispartof names the journal
    And dc.citation volume, issue, spage and epage are 99, 2, 155 and 61

  @test:schemas/reference.test.ts::dcToCslRoundTripKeepsLocators
  Scenario: Dublin Core → CSL reads them back: the round trip keeps container, volume, issue and pages
    When the article goes to Dublin Core and back to CSL
    Then the container, volume, issue and pages are kept
    And it is article-journal with the same authors

  @test:schemas/reference.test.ts::placeAccessedVersionStatusSurvive
  Scenario: publisher-place, accessed, version and status survive the round trip
    Given a standard with publisher-place, accessed, version and status
    When it goes to Dublin Core and back
    Then all four are kept

  @test:schemas/reference.test.ts::igCslTypesSurvive
  Scenario: a CSL type the IGs use (webpage, standard, legislation) survives as itself
    When references of type webpage, standard, legislation, report and book go to Dublin Core and back
    Then each keeps its type

  @test:schemas/reference.test.ts::cslJsonDropsNodeFields
  Scenario: CSL-JSON: an array of CSL items, node fields dropped
    When two references are exported as CSL-JSON
    Then the items are garoufalidis2004 and who2014handbook with no $schema or provenance

  @test:schemas/reference.test.ts::bibtexThroughFormatter
  Scenario: BibTeX: through the formatter references.bib is written with
    When the references are exported as BibTeX
    Then there is an article and a book entry with pages 291--309 and the organisation as author

  @test:schemas/reference.test.ts::risOneRecordCrlf
  Scenario: RIS: one record per reference, CRLF, ER-terminated
    When the references are exported as RIS
    Then there are two CRLF-separated records, a JOUR and a BOOK, with their pages and ISBN
    And each ends with "ER - "

  @test:schemas/reference.test.ts::jsonLdIdJoinsCitations
  Scenario: the JSON-LD @id joins the citations: same @base as content documents
    When the JSON-LD context is read
    Then its @base is the folio base and it binds no schema prefix
    And dcterms:source and dcterms:hasVersion are typed @id

  @test:schemas/reference.test.ts::jsonLdOneGraph
  Scenario: Dublin Core / BIBO JSON-LD: one @graph
    When the references are exported as one JSON-LD graph
    Then the graph holds both references with no per-node context

  @test:schemas/reference.test.ts::dcXmlReusesRenderer
  Scenario: Dublin Core XML: reuses 7eak renderDcXml for single and multi-record sets
    When one and then two references are exported as Dublin Core XML
    Then the single record carries the title, creator and DOI
    And the set is wrapped in records and holds both titles

  @test:schemas/reference.test.ts::emptySetExportsEmpty
  Scenario: an empty set exports empty
    When an empty set is exported
    Then BibTeX and RIS are empty, CSL-JSON is [] and the XML closes records

  @test:schemas/reference.test.ts::authorsRawToCslNames
  Scenario: authorsRawToNames parses authors_raw strings into CSL names
    When authors_raw strings are parsed
    Then "Stavros Garoufalidis and Thang T. Q. Lê" gives two family/given names
    And "World Health Organization" gives a literal

  @test:schemas/reference.test.ts::libraryItemProjectsToReference
  Scenario: libraryItemToReference projects manifest.jsonld + structure metadata into a library ReferenceNode
    Given a library entry with manifest.jsonld and structure metadata
    When it is projected to a reference
    Then the reference has the entry's id, title, author, DOI, URL and year
    And its provenance is library, derived from the manifest and held at the entry

  @test:schemas/reference.test.ts::genReferenceJsonLdWritesAndChecks
  Scenario: genReferenceJsonLd writes and checks references/<key>.jsonld from CSL-JSON entries
    Given a folio with references/garoufalidis2004.json
    When genReferenceJsonLd is checked, run, and checked again
    Then the first check finds one stale file
    And the run writes references/garoufalidis2004.jsonld with its @id and title
    And the second check finds nothing stale

  @test:schemas/reference.test.ts::buildStandaloneReference
  Scenario: buildStandaloneReference builds a schema-valid folio-reference/v1 standalone node from fields or BibTeX
    When standalone references are built from fields and from BibTeX
    Then the node, its JSON-LD and its path are schema-valid with id smith2024
    And its CSL carries no $schema or @context
    And the BibTeX one round-trips as euler1736

  @test:schemas/reference.test.ts::safeHrefEnforced
  Scenario: buildStandaloneReference and newReferenceUrl enforce safeHref on URLs
    When a reference with a javascript: URL is built and new-reference URLs are made
    Then the unsafe URL is dropped
    And a GitHub new-file URL is made for a safe repository
    And javascript: and protocol-relative repositories give no URL

  @test:schemas/reference.test.ts::typologyNamesValidatedFamily
  Scenario: the references typology names the family its validator checks
    When the references typology and the reference validator are read
    Then the typology's only node schema is the reference tag
    And the validator validates that family with ReferenceKind

  @test:schemas/reference.test.ts::declaresExactlyReferencePrefixes
  Scenario: folio-assistant-core.json declares exactly the reference prefixes the export binds itself
    When folio-assistant-core.json is read
    Then its jsonldPrefixes are exactly bibo and fabio, as the export binds them
