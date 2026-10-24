import { webpage } from "@litlfred/cat-harness/schemas/webpage.ts";

export default webpage({
  slug: "concepts/document-content-type",
  title: "Documents & policy guidance",
  parent: "Content types",
  navOrder: 2,
  nodes: [
    {
      id: "documents-policy-guidance",
      title: "Documents & policy guidance",
      asset: {
        kind: "bpmn",
        source: "processes/content/authoring-a-document.bpmn",
        rendered: "../assets/img/workflows/authoring-a-document.svg",
        alt: "BPMN swimlane diagram of document authoring: the author plans, the plan is seeded as beans, an agent scaffolds the folio and authors blocks, the build pipeline checks the declared profile before validating and rendering to Markdown, HTML and PDF, and a reviewer gates publication.",
        sourceLinks: [
          { text: "BPMN 2.0 source", href: "https://github.com/litlfred/folio-assistant/blob/main/processes/authoring-a-document.bpmn" },
          { text: "full-size SVG", href: "../assets/img/workflows/authoring-a-document.svg" },
        ],
        linkStyle: "caption",
      },
      lead: "documents-policy-guidance-lead",
    },
    {
      id: "carrying-a-normative-statement",
      title: "Carrying a normative statement",
      level: 3,
      block: "carrying-a-normative-statement",
    },
  ],
});
