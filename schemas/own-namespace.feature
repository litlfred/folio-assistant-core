Feature: this layer's own namespaces

  @test:schemas/own-namespace.test.ts::vocabularyNamespaceUnchanged
  Scenario: the vocabulary namespace is unchanged
    When the core namespace is read
    Then it is https://litlfred.github.io/folio-assistant-core/v0/ns/

  @test:schemas/own-namespace.test.ts::dspaceNamespaceUnchanged
  Scenario: the DSpace field namespace is unchanged, and is what dublin-core mints under
    When the DSpace namespace is read
    Then it is the core namespace followed by dspace/
    And it is the namespace dublin-core mints under
