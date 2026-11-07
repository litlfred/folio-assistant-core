Feature: the work-plan operation each editing step declares

  @test:scripts/tests/bean-link.test.ts::editingOpensNotesCloses
  Scenario: the editing process opens, notes, then closes — claim and resolve through the shared processes
    When editing-hci-validation.bpmn is loaded
    Then claiming calls the shared open process, whose step claims
    And logging findings notes
    And resolving calls the shared close process, whose step resolves
