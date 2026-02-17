// LexicalEditorCondition5.tsx
import React, { useEffect } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";

import AnnotationOnBlurPlugin, { applyAnnotationsToRoot } from "./plugins/AnnotationOnBlurPlugin";
import SearchHighlightLivePlugin from "./plugins/SearchHighlightLivePlugin";
import { SentenceIssueNode } from "./nodes/SentenceIssueNode";
import SentenceIssuePlugin from "./plugins/SentenceIssuePlugin";
import type { SentenceIssue } from "./plugins/SentenceIssuePlugin";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isParagraphNode,
  BLUR_COMMAND,
  COMMAND_PRIORITY_LOW,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  $createRangeSelection,
} from "lexical";

// 复用原来的类型
type ParagraphAnnotation = { keyWords: string[]; keySentences: string[] };

type Props = {
  value: string[];
  sceneKey: number;
  onBlurCommit: (lines: string[]) => void;
  annotations?: ParagraphAnnotation[];

  // condition3
  searchTerm?: string;
  highlightEnabled?: boolean;
  searchTriggered?: boolean;
  wholeWordOnly?: boolean;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;

  // condition5 新增
  issues?: SentenceIssue[];
  onSelectIssue?: (id: string) => void;
};

// ===== 下面这些 helper 直接复制你的（不改逻辑）=====
function getParagraphLines() {
  const root = $getRoot();
  const children = root.getChildren();
  const lines: string[] = [];
  for (const node of children) {
    if ($isParagraphNode(node)) lines.push(node.getTextContent());
    else lines.push(node.getTextContent());
  }
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}
function flattenAnnotations(annotations: ParagraphAnnotation[]) {
  return {
    keyWords: annotations.flatMap((a) => a?.keyWords ?? []),
    keySentences: annotations.flatMap((a) => a?.keySentences ?? []),
  };
}
function getGlobalOffsetFromSelection(): number {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return 0;
  const root = $getRoot();
  const anchor = selection.anchor;
  let count = 0;
  const textNodes = root.getAllTextNodes();
  for (const n of textNodes) {
    if (n.getKey() === anchor.key) break;
    count += n.getTextContentSize();
  }
  return count + anchor.offset;
}
function restoreSelectionByGlobalOffset(globalOffset: number) {
  const root = $getRoot();
  const textNodes = root.getAllTextNodes();
  let remain = globalOffset;
  for (const n of textNodes) {
    const size = n.getTextContentSize();
    if (remain <= size) {
      const sel = $createRangeSelection();
      sel.anchor.set(n.getKey(), Math.max(0, remain), "text");
      sel.focus.set(n.getKey(), Math.max(0, remain), "text");
      $setSelection(sel);
      return;
    }
    remain -= size;
  }
}

function SyncValuePlugin({
  value,
  sceneKey,
  annotations = [],
}: {
  value: string[];
  sceneKey: any;
  annotations?: ParagraphAnnotation[];
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.update(() => {
      const root = $getRoot();
      root.clear();

      value.forEach((line) => {
        const p = $createParagraphNode();
        p.append($createTextNode(line ?? ""));
        root.append(p);
      });

      if (value.length === 0) root.append($createParagraphNode());

      const { keyWords, keySentences } = flattenAnnotations(annotations);
      applyAnnotationsToRoot(keyWords, keySentences);
    });
  }, [editor, sceneKey]);

  return null;
}

export function BlurCommitPlugin({
  onBlurCommit,
  annotations = [],
  updateAnnotationsOnBlur = true,
}: {
  onBlurCommit?: (lines: string[]) => void;
  annotations?: ParagraphAnnotation[];
  updateAnnotationsOnBlur?: boolean;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!onBlurCommit) return;

    return editor.registerCommand(
      BLUR_COMMAND,
      () => {
        let globalOffset = 0;
        editor.getEditorState().read(() => {
          globalOffset = getGlobalOffsetFromSelection();
        });

        editor.update(() => {
          onBlurCommit(getParagraphLines());

          if (updateAnnotationsOnBlur) {
            const { keyWords, keySentences } = flattenAnnotations(annotations);
            applyAnnotationsToRoot(keyWords, keySentences);
            restoreSelectionByGlobalOffset(globalOffset);
          }
        });

        return false;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor, onBlurCommit, annotations, updateAnnotationsOnBlur]);

  return null;
}

export default function LexicalEditorCondition5({
  value,
  sceneKey,
  onBlurCommit,
  annotations = [],
  searchTerm,
  highlightEnabled,
  searchTriggered,
  wholeWordOnly,
  searchInputRef,
  issues = [],
  onSelectIssue,
}: Props) {
  const initialConfig = {
    namespace: "DraftLensEditorC5",
    nodes: [SentenceIssueNode], // ✅ 只在 condition5 editor 注册 node
    onError(error: Error) {
      console.error(error);
    },
  };

  const flat = flattenAnnotations(annotations);

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <RichTextPlugin
        contentEditable={<ContentEditable className="scriptText" />}
        placeholder={null}
        ErrorBoundary={({ children }) => <>{children}</>}
      />
      <HistoryPlugin />

      <AnnotationOnBlurPlugin enabled={false} keyWords={flat.keyWords} keySentences={flat.keySentences} />

      <SyncValuePlugin value={value} sceneKey={sceneKey} annotations={annotations} />

      <BlurCommitPlugin onBlurCommit={onBlurCommit} annotations={annotations} updateAnnotationsOnBlur={false} />

      <SearchHighlightLivePlugin
        enabled={!!highlightEnabled && !!searchTerm?.trim()}
        keyWords={flat.keyWords}
        keySentences={flat.keySentences}
        searchTerm={searchTerm ?? ""}
        searchTriggered={searchTriggered}
        wholeWordOnly={wholeWordOnly}
        searchInputRef={searchInputRef}
      />

      {/* ✅ condition5 专属：句子问题标注 */}
      <SentenceIssuePlugin issues={issues} onSelectIssue={onSelectIssue} />
    </LexicalComposer>
  );
}
