Feature: moving a review comment through its lifecycle

  @test:scripts/review-comment-move.test.ts::feedbackDirFromTodosGraph
  Scenario: is read from the todos graph, and a graph without one is an error naming the remedy
    When the todo-feedback directory is read from the todos graph
    Then it is todos/feedback
    And a graph without one, or no graph, is an error naming the remedy

  @test:scripts/review-comment-move.test.ts::moveFromPublishedThenCommitted
  Scenario: starts from the published comment, writes the node as JSON, and the next move reads the committed file
    When the comment is moved to addressed from the published copy, then to resolved
    Then the first move writes the node as JSON with status addressed
    And the second starts from the committed file and records the decision

  @test:scripts/review-comment-move.test.ts::refusesIllegalMove
  Scenario: refuses a move the task may not make, and writes nothing
    When an open comment is moved straight to resolved
    Then it is refused and nothing is written

  @test:scripts/review-comment-move.test.ts::unknownIdError
  Scenario: an unknown id is an error, not a new comment
    When a comment id that does not exist is moved
    Then it is an error

  @test:scripts/review-comment-move.test.ts::featureBranchOnly
  Scenario: refuses the base branch and a detached HEAD; accepts a feature branch
    When the branch is checked on main, on a detached HEAD and on a feature branch
    Then main and detached HEAD are refused and the feature branch is accepted

  @test:scripts/review-comment-move.test.ts::commandCommitsOnFeature
  Scenario: the command commits the move to the feature branch, and on main refuses before writing
    When the command runs with --commit on main and then on a feature branch
    Then on main it exits 1 and writes nothing
    And on the feature branch it exits 0 and commits the move with its message

  @test:scripts/review-comment-move.test.ts::committedWinsOverPublished
  Scenario: a committed comment wins over the previously published copy
    When the published file is rebuilt after a committed move
    Then the comment's status is the committed one
