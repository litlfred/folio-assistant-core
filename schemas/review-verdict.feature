Feature: a reviewer's verdict on blocks, pages and inputs, and the coverage it gives

  @test:schemas/review-verdict.test.ts::readsBlocksVerdictRole
  Scenario: reads one or several blocks, a verdict and a role
    When verdict tags with one or several blocks are parsed
    Then they give the blocks, verdict and role
    And a comma-separated list and "Changes" are read too

  @test:schemas/review-verdict.test.ts::waiverCarriesReason
  Scenario: a waiver carries its reason, and refuses to be empty
    When a waive tag is parsed with and without a reason
    Then with a reason it is waived with that reason
    And without one it is an error

  @test:schemas/review-verdict.test.ts::verdictOrReviewNeverBoth
  Scenario: a comment is a verdict OR a review comment: never counted as both
    When a comment with both kind and verdict is parsed
    Then as a verdict it is an error and as a review comment it is null
    And a plain verdict is not a review comment

  @test:schemas/review-verdict.test.ts::leavesConversationAlone
  Scenario: leaves ordinary conversation and review comments alone
    When conversation and a review comment are parsed as verdicts
    Then both give null

  @test:schemas/review-verdict.test.ts::unknownVerdictNamesWaive
  Scenario: refuses an unknown verdict, naming the way to waive
    When the verdict "skip" is parsed
    Then the error names waive:

  @test:schemas/review-verdict.test.ts::readsPageAndInput
  Scenario: reads `page:` and `input:` beside, or instead of, `block:`
    When tags with page: and input: are parsed
    Then pages and inputs are read
    And a verdict with no target is an error naming page:

  @test:schemas/review-verdict.test.ts::pageVerdictPinnedToBuild
  Scenario: records a page or input verdict pinned to the build's pin, with its target
    When a verdict on a page and an input is ingested
    Then one verdict per target is created, pinned to its build pin
    And the page verdict's id is derived from PR, comment and target

  @test:schemas/review-verdict.test.ts::unlistedPageMalformed
  Scenario: a page the build does not list, or a build with no rendered impact, is malformed and says which
    When verdicts on an unlisted page, and on a build with no rendered impact, are ingested
    Then each is malformed and says why

  @test:schemas/review-verdict.test.ts::oneVerdictPerLabelIdempotent
  Scenario: records one verdict per label, pinned to the block's current hash, and is idempotent
    When a verdict on two blocks is ingested twice
    Then one verdict per label is created at its current hash
    And the second ingest creates nothing

  @test:schemas/review-verdict.test.ts::missingLabelSaid
  Scenario: a label the head does not carry is said, not recorded
    When a verdict on a label the head lacks is ingested
    Then nothing is created and the malformed entry names it

  @test:schemas/review-verdict.test.ts::coveredOnlyAtCurrentHash
  Scenario: counts a changed block covered only by a verdict on its CURRENT hash
    When coverage is computed with a verdict on an old hash of prose:dose
    Then prose:dose is uncovered and its verdict stale

  @test:schemas/review-verdict.test.ts::removedNeedsNoVerdict
  Scenario: a removed block needs no verdict; unchanged blocks are not counted
    When coverage is computed with verdicts at current hashes
    Then no block is uncovered

  @test:schemas/review-verdict.test.ts::countsOpenAddressedDefects
  Scenario: counts open and addressed defects, and nothing else
    When coverage is computed over open, addressed and resolved defects and an open question
    Then two open defects are counted

  @test:schemas/review-verdict.test.ts::noImpactPageHalfAbsent
  Scenario: without a rendered impact the page half is ABSENT, not zero, and page verdicts cannot count
    When coverage is computed with no rendered impact and a page verdict
    Then rendered and measured are absent and the page verdict is stale

  @test:schemas/review-verdict.test.ts::indexNotOwedOthersOwed
  Scenario: index files are never owed; anchorless pages are owed until a page verdict; undetermined inputs until reviewed
    When coverage is computed with a rendered impact and no verdicts
    Then rendered is known
    And the unreviewed pages and undetermined inputs are listed

  @test:schemas/review-verdict.test.ts::pageReviewedByBlocksAndPin
  Scenario: a page is reviewed block by block, and its data file goes with a page that shares its pin
    When coverage is computed with block, page and input verdicts at current pins
    Then nothing is unreviewed, undetermined or uncovered

  @test:schemas/review-verdict.test.ts::oldPinPageVerdictStale
  Scenario: a page verdict at an older pin is stale and does not count
    When coverage is computed with a page verdict at an old pin
    Then the page is unreviewed and the verdict stale

  @test:schemas/review-verdict.test.ts::missedPagesOnlyAgainstBase
  Scenario: missed pages count only when the before side was the base, and a page verdict at the measured pin clears one
    When coverage is computed with missed pages measured against the base, against another side, and with a page verdict
    Then against the base the missed page counts
    And against another side none count
    And a page verdict at the measured pin clears it
