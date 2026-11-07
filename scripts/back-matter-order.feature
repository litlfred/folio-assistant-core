Feature: the order of a document's back matter

  @test:scripts/back-matter-order.test.ts::agreedOrderPasses
  Scenario: the agreed order passes
    When chapters in the agreed order are checked
    Then there are no findings

  @test:scripts/back-matter-order.test.ts::glossaryAcronymsFirstFlagged
  Scenario: glossary and acronyms first, as dpi-h-ra was
    When acronyms and glossary come before the main chapters
    Then the findings are glossary-before-main and acronyms-own-chapter

  @test:scripts/back-matter-order.test.ts::frontMatterGlossaryFlagged
  Scenario: a front-matter chapter holding the glossary, as dth-sc was
    When a front-matter chapter holds the glossary
    Then the finding is glossary-before-main

  @test:scripts/back-matter-order.test.ts::acronymsInAnnexFlagged
  Scenario: acronyms in an annex while a glossary chapter exists
    When acronyms are in an annex while a glossary chapter exists
    Then the finding is acronyms-outside-glossary

  @test:scripts/back-matter-order.test.ts::noGlossaryPasses
  Scenario: a document with no glossary passes
    When a document with no glossary is checked
    Then there are no findings
