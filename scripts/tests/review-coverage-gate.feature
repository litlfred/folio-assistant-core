Feature: the review coverage gate decision table

  @test:scripts/tests/review-coverage-gate.test.ts::everyExpressionReadable
  Scenario: every expression in it can be read by the engine
    When the table's expressions are checked
    Then none is unreadable

  @test:scripts/tests/review-coverage-gate.test.ts::coveredWhenNothingOwed
  Scenario: covered when nothing is owed
    When the table decides with nothing owed
    Then the answer is yes

  @test:scripts/tests/review-coverage-gate.test.ts::eachCountKeepsOpen
  Scenario: each count it reads keeps the review open, and says which rule
    When each count is set in turn
    Then each keeps the review open with its own rule

  @test:scripts/tests/review-coverage-gate.test.ts::uncomputedPageCountNotRead
  Scenario: a page count that was not computed is not read: an absent rendered impact or a not-base measurement
    When page counts are given with an absent rendered impact or a not-base measurement
    Then the answer is yes

  @test:scripts/tests/review-coverage-gate.test.ts::refusesMissingFact
  Scenario: refuses to decide without every fact, rather than reading a missing one as 0
    When the table decides with facts missing
    Then it throws
