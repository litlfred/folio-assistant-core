Feature: a figure that is a model view drawn from the model

  @test:scripts/live-figures.test.ts::findsBlockImage
  Scenario: finds the block's image, with links from the document page
    When the live figures are found
    Then the block's image maps to the view's SVG and its page

  @test:scripts/live-figures.test.ts::embedsObjectKeepsPng
  Scenario: embeds the drawing as an object, so its links work, and keeps the PNG as the fallback
    When the page's figures are replaced
    Then the mapped image becomes an object of the SVG with the PNG as fallback and a link to the view
    And an unmapped image is unchanged

  @test:scripts/live-figures.test.ts::noMappingNoChange
  Scenario: changes nothing when no figure is mapped
    When no figure is mapped
    Then the page is unchanged
