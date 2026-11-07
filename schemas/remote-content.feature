Feature: remote content: Dublin Core, materialization and the catalogue

  @test:schemas/remote-content.test.ts::keepsBothIdentifierUris
  Scenario: keeps BOTH identifier.uri values
    When the record's identifier.uri values are read
    Then both Handle URIs are kept in order

  @test:schemas/remote-content.test.ts::keepsBothMeshWithLanguage
  Scenario: keeps BOTH subject.mesh values, with their language tags
    When the record's subject.mesh values are read
    Then there are two, each in English

  @test:schemas/remote-content.test.ts::absentLanguageDistinct
  Scenario: distinguishes an absent language from an asserted one
    When the title and the issued date are read
    Then the title is in English and the date has no language

  @test:schemas/remote-content.test.ts::elementSpansQualifiers
  Scenario: spans qualifiers when asked for an element
    When the identifier element is read
    Then it spans dc.identifier.govdoc and dc.identifier.uri

  @test:schemas/remote-content.test.ts::materializedNeedsGates
  Scenario: refuses `materialized` with no gates recorded
    When a materialized node with no gates is validated
    Then it is refused

  @test:schemas/remote-content.test.ts::materializedNeedsLocalPath
  Scenario: refuses `materialized` with no local path
    When a materialized node with no local path is validated
    Then it is refused

  @test:schemas/remote-content.test.ts::gatesOnlyWhenMaterialized
  Scenario: refuses gates on a node that was never materialized
    When a referenced node with gates is validated
    Then it is refused

  @test:schemas/remote-content.test.ts::unknownApartFromPermitted
  Scenario: separates `unknown` from `permitted`
    When the gates are read
    Then copyright, restrictions and sourceLoss are unanswered
    And none is refused

  @test:schemas/remote-content.test.ts::fourFreshnessVerdicts
  Scenario: reports four freshness verdicts, not a boolean
    When freshness is computed for a referenced node and materialized copies with no, past and future expiry
    Then they are not-materialized, no-expiry, expired and fresh

  @test:schemas/remote-content.test.ts::noDefaultState
  Scenario: has no default state — a node that does not say is invalid
    When a node with no state is validated
    Then it is refused

  @test:schemas/remote-content.test.ts::materializedNeedsPurpose
  Scenario: refuses a materialized copy that has not said WHY it was taken
    When a materialized copy with no purpose is validated
    Then it is refused

  @test:schemas/remote-content.test.ts::archivalNeedsFixity
  Scenario: refuses an archival copy with no fixity
    When an archival copy with no fixity is validated
    Then it is refused

  @test:schemas/remote-content.test.ts::workingCannotDischargeSourceLoss
  Scenario: refuses a WORKING copy that claims to have discharged sourceLoss
    When a working copy whose sourceLoss is permitted is validated
    Then it is refused

  @test:schemas/remote-content.test.ts::archiveIsPermanent
  Scenario: reports an archive as `permanent`, not as the `no-expiry` finding
    When freshness is computed for an archival copy with fixity and for a working copy
    Then the archive is permanent and the working copy no-expiry

  @test:schemas/remote-content.test.ts::libraryIdNeedsMaterialized
  Scenario: refuses a libraryId on a node that says it is not materialized
    When a catalogue node with a libraryId that says it is referenced is validated
    Then it is refused

  @test:schemas/remote-content.test.ts::containerHasNoBitstreams
  Scenario: refuses bitstreams on a container
    When a container node with bitstreams is validated
    Then it is refused

  @test:schemas/remote-content.test.ts::censusCountsStatesApart
  Scenario: counts the three states separately and never as a percentage
    When the census of a referenced and an unknown node is taken
    Then it counts unknown 1, referenced 1, materialized 0

  @test:schemas/remote-content.test.ts::onlyCopyrightRestrictionsDecide
  Scenario: only copyright and restrictions decide, and only `permitted` passes
    When publication blockers are computed for gates all permitted, all refused and all unknown
    Then all permitted blocks nothing
    And refused or unknown block on copyright and restrictions
    And a refused size gate blocks nothing

  @test:schemas/remote-content.test.ts::noGatesBlocksBoth
  Scenario: no gates at all blocks on both
    When publication blockers are computed with no gates
    Then copyright and restrictions block
