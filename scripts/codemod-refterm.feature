Feature: wrapping a defined term in :refterm

  @test:scripts/codemod-refterm.test.ts::leavesInlineCode
  Scenario: inline code
    When prose with the term in inline code and bare is rewritten
    Then the code is kept and the bare term is wrapped once

  @test:scripts/codemod-refterm.test.ts::leavesFencedCode
  Scenario: fenced code
    When prose with the term in a fence and bare is rewritten
    Then the fence is kept and the term wrapped once

  @test:scripts/codemod-refterm.test.ts::leavesInlineMath
  Scenario: inline math
    When prose with the term in inline math and bare is rewritten
    Then the math is kept and the term wrapped once

  @test:scripts/codemod-refterm.test.ts::leavesDisplayMath
  Scenario: display math
    When prose with the term in display math and bare is rewritten
    Then the math is kept and the term wrapped once

  @test:scripts/codemod-refterm.test.ts::noRewrap
  Scenario: an already-wrapped term is not re-wrapped
    When prose with the term already wrapped is rewritten
    Then nothing changes

  @test:scripts/codemod-refterm.test.ts::rewritesProseEverywhere
  Scenario: paragraph, heading, emphasis, table cell, container directive
    When a paragraph, heading, emphasis, table cell and container directive are rewritten
    Then each has the term wrapped

  @test:scripts/codemod-refterm.test.ts::noSelfWrap
  Scenario: a block does not re-wrap the term it defines itself
    When a block that defines the term is rewritten
    Then nothing changes

  @test:scripts/codemod-refterm.test.ts::noPhraseNoChange
  Scenario: no known phrase, no change
    When prose with no known phrase is rewritten
    Then nothing changes
