// 这个 node 负责“句子问题”的装饰（叹号/下划线等），不包含文本内容；文本内容仍是普通 text node
import {
  DecoratorNode,
} from "lexical";
import type {
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
} from "lexical";
import type { JSX } from "react";

export type SentenceIssuePayload = {
  id: string;
  issue: string;
};

export type SerializedSentenceIssueNode = SerializedLexicalNode & {
  type: "sentence-issue";
  version: 1;
  payload: SentenceIssuePayload;
};

export class SentenceIssueNode extends DecoratorNode<JSX.Element> {
  __payload: SentenceIssuePayload;

  static getType(): string {
    return "sentence-issue";
  }

  static clone(node: SentenceIssueNode): SentenceIssueNode {
    return new SentenceIssueNode(node.__payload, node.__key);
  }

  constructor(payload: SentenceIssuePayload, key?: NodeKey) {
    super(key);
    this.__payload = payload;
  }

  getPayload() {
    return this.__payload;
  }

  exportJSON(): SerializedSentenceIssueNode {
    return {
      type: "sentence-issue",
      version: 1,
      payload: this.__payload,
    };
  }

  static importJSON(serializedNode: SerializedSentenceIssueNode): SentenceIssueNode {
    return new SentenceIssueNode(serializedNode.payload);
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const span = document.createElement("span");
    span.className = "sentenceIssueWrap"; // 你自己写 css：下划线等
    return span;
  }

  updateDOM(): boolean {
    return false;
  }

  decorate(): JSX.Element {
    const { issue, id } = this.__payload;

    return (
      <span className="sentenceIssueInner">
        {/* 叹号 */}
        <span className="sentenceIssueBang" data-tip={issue} data-issue-id={id}><span className="issueIcon" /></span>

      </span>
    );
  }
}

export function $createSentenceIssueNode(payload: SentenceIssuePayload) {
  return new SentenceIssueNode(payload);
}

export function $isSentenceIssueNode(node: LexicalNode | null | undefined): node is SentenceIssueNode {
  return node instanceof SentenceIssueNode;
}