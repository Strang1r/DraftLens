import { DecoratorNode } from "lexical";
import type { EditorConfig, LexicalNode, NodeKey, SerializedLexicalNode } from "lexical";
import type { JSX } from "react";

export type SerializedSentenceIssueEndNode = SerializedLexicalNode & {
  type: "sentence-issue-end";
  version: 1;
};

export class SentenceIssueEndNode extends DecoratorNode<JSX.Element> {
  static getType(): string {
    return "sentence-issue-end";
  }

  static clone(node: SentenceIssueEndNode): SentenceIssueEndNode {
    return new SentenceIssueEndNode(node.__key);
  }

  constructor(key?: NodeKey) {
    super(key);
  }

  exportJSON(): SerializedSentenceIssueEndNode {
    return { type: "sentence-issue-end", version: 1 };
  }

  static importJSON(_serializedNode: SerializedSentenceIssueEndNode): SentenceIssueEndNode {
    return new SentenceIssueEndNode();
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const span = document.createElement("span");
    span.className = "sentenceIssueEnd";
    span.style.display = "none"; // 不占位置
    return span;
  }

  updateDOM(): boolean {
    return false;
  }

  decorate(): JSX.Element {
    return <span />;
  }
}

export function $createSentenceIssueEndNode() {
  return new SentenceIssueEndNode();
}

export function $isSentenceIssueEndNode(
  node: LexicalNode | null | undefined
): node is SentenceIssueEndNode {
  return node instanceof SentenceIssueEndNode;
}
