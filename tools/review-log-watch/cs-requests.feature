Feature: requests about change sets in review feedback

  @test:tools/review-log-watch/cs-requests.test.ts::findsSplitMergeMoveNew
  Scenario: split, merge, move and new are found
    When feedback cells asking to split, merge, move and make a new change set are read
    Then each request is found with its kind, change sets and comment numbers

  @test:tools/review-log-watch/cs-requests.test.ts::ordinaryFeedbackNotRequest
  Scenario: ordinary feedback is not a request
    When ordinary feedback, including "split the sentence in two", is read
    Then neither is a request

  @test:tools/review-log-watch/cs-requests.test.ts::readsIssueFormFields
  Scenario: reads the fields GitHub writes
    When a change-set issue form body is read
    Then its kind, title, change sets, comments and details are read, and _No response_ is empty

  @test:tools/review-log-watch/cs-requests.test.ts::nonFormNull
  Scenario: a body that is not the form is null
    When a plain bug report is read
    Then it gives null

  @test:tools/review-log-watch/cs-requests.test.ts::sharedSectionFirstThenNew
  Scenario: an open change set that shares a section comes first, then new
    When a comment in 4.1 Scope is triaged with open change sets
    Then the open change set sharing its chapter comes first, then new, each with its committees

  @test:tools/review-log-watch/cs-requests.test.ts::noOpenOnlyNew
  Scenario: no open change set: only new
    When a comment no open change set shares is triaged
    Then only new is offered
