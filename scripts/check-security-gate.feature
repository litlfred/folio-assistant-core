Feature: the core security gate

  @test:scripts/check-security-gate.test.ts::passesOnOwnRoot
  Scenario: passes all blocking checks on folio-assistant-core's own root
    When the gate runs on folio-assistant-core's root
    Then nothing blocks and every check passes

  @test:scripts/check-security-gate.test.ts::unknownWhenAbsent
  Scenario: reports unknown (and blocks) when .github/workflows and package.json are absent
    Given a root without workflows or package.json
    When the gate runs
    Then the workflow, secret, lockfile and action checks are unknown
    And something blocks

  @test:scripts/check-security-gate.test.ts::detectsBadRoot
  Scenario: detects unpinned action, workflow injection, unpinned bun install, and secret leak in a target root
    Given a root with an unpinned action, a workflow injection, an unpinned install and a leaked token
    When the gate runs
    Then workflow-injection, secret-leaks, lockfile-pinning, bun-pin and action-sha-pinning fail
    And at least five checks block
