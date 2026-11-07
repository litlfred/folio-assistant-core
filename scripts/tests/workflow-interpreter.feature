Feature: the workflow interpreter over the editing process

  @test:scripts/tests/workflow-interpreter.test.ts::modelCarriesExtensions
  Scenario: skills and work-plan marks come off the folio: extensions
    When editing-hci-validation is loaded
    Then the draft step carries its skills, lane and name
    And claiming calls the open process and logging findings touches the work plan

  @test:scripts/tests/workflow-interpreter.test.ts::callActivityReportsProcess
  Scenario: a call activity reports the process it expands into
    When content-lifecycle is loaded
    Then its editing call activity names Process_Editing

  @test:scripts/tests/workflow-interpreter.test.ts::freshInstanceFirstStep
  Scenario: a fresh instance enables exactly the first step
    When a fresh instance is started
    Then only "Describe the intended change" is enabled

  @test:scripts/tests/workflow-interpreter.test.ts::commitBeforeDecisionRefused
  Scenario: committing cannot be reported before the editor has decided
    When Task_Commit is completed on a fresh instance
    Then it throws as not enabled

  @test:scripts/tests/workflow-interpreter.test.ts::noRecommendationSkipsEvidence
  Scenario: a change with no recommendation skips the evidence search, and says so
    When the evidence phase is told no recommendation is in play
    Then drafting is next, the gateway was walked and the PICO step was not

  @test:scripts/tests/workflow-interpreter.test.ts::bothBranchesBeforeCollation
  Scenario: both validation branches must report before the findings are collated
    When the draft is validated
    Then both validation branches must report before the findings are collated

  @test:scripts/tests/workflow-interpreter.test.ts::acceptReachesCorpus
  Scenario: accept reaches the corpus; discard does not
    When the editor accepts in one run and discards in another
    Then accept enables the commit
    And discard ends the run with nothing enabled and no commit

  @test:scripts/tests/workflow-interpreter.test.ts::reviseLoopsBack
  Scenario: revise loops back to the agent and re-runs validation
    When the editor asks for a revision
    Then the work goes back to the agent and validation runs again

  @test:scripts/tests/workflow-interpreter.test.ts::gatewayNeedsOutcome
  Scenario: completing a gateway without an outcome refuses, and lists the outcomes
    When the reviewer-kind gateway is completed without an outcome and with an unknown one
    Then each is refused, listing the valid outcomes

  @test:scripts/tests/workflow-interpreter.test.ts::instanceRoundTrips
  Scenario: an instance round-trips through the store under a derived id
    When an instance is saved and loaded under its derived id
    Then the id is editing--def-carbon-valence
    And the loaded instance keeps its bean, tokens and next step
