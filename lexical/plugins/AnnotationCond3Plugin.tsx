// src/components/plugins/AnnotationCond3Plugin.tsx
import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getRoot,
  $createTextNode,
  BLUR_COMMAND,
  COMMAND_PRIORITY_LOW,
  $isParagraphNode,
} from "lexical";

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * condition3 专用版 applyAnnotationsToRoot
 * ✅ 保持 search 匹配与展示逻辑不变
 * ✅ 不依赖 AnnoRangeNode（已移除 start/end marker）
 */
export function applyAnnotationsToRoot(
  keyWords: string[] = [],
  keySentences: string[] = [],
  searchWords: string[] = [],
  searchEnabled: boolean = false,
  wholeWordOnly: boolean = false
) {
  const root = $getRoot();
  const children = root.getChildren();

  const paragraphMap: Array<{ para: any; startOffset: number; text: string }> =
    [];
  let fullText = "";

  children.forEach((node) => {
    if (!$isParagraphNode(node)) return;
    const text = node.getTextContent() ?? "";
    paragraphMap.push({
      para: node,
      startOffset: fullText.length,
      text,
    });
    fullText += text;
  });

  const kws = (keyWords || []).map((s) => s.trim()).filter(Boolean);
  const ks = (keySentences || []).map((s) => s.trim()).filter(Boolean);

  const kwRegex =
    kws.length > 0
      ? new RegExp(`(${kws.map(escapeRegExp).join("|")})`, "gi")
      : null;

  // ===== condition3 搜索（保持逻辑不变）=====
  const sws = (searchWords || []).map((s) => s.trim()).filter(Boolean);
  const searchRegex =
    searchEnabled && sws.length > 0
      ? new RegExp(
        wholeWordOnly
          ? `(${sws
            .map((s) =>
              s.includes(" ")
                ? escapeRegExp(s)
                : `\\b${escapeRegExp(s)}\\b`
            )
            .join("|")})`
          : `(${sws.map(escapeRegExp).join("|")})`,
        "gi"
      )
      : null;

  const globalSearchMatches: Array<{ start: number; end: number }> = [];

  if (searchRegex && fullText) {
    let match;
    searchRegex.lastIndex = 0;
    while ((match = searchRegex.exec(fullText)) !== null) {
      globalSearchMatches.push({
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  const appendWithStyles = (
    p: any,
    segment: string,
    underline: boolean,
    isSearchHighlight: boolean = false
  ) => {
    if (!segment) return;

    const parts = kwRegex ? segment.split(kwRegex) : [segment];

    parts.forEach((part) => {
      if (!part) return;

      const isKeyword = kwRegex ? kwRegex.test(part) : false;
      if (kwRegex) kwRegex.lastIndex = 0;

      const styles: string[] = [];

      // ✅ search 高亮（优先级保持不变）
      if (isSearchHighlight) {
        styles.push("background: #e6e1db");
        styles.push(
          "padding: calc(5 / 1080 * 100vh) calc(4 / 1080 * 100vw)"
        );
      }

      // ✅ 关键句下划线
      if (underline) {
        styles.push("border-bottom: calc(1 / 1080 * 100vh) solid #222");
        styles.push("padding-bottom: calc(5 / 1080 * 100vh)");
      }

      // ✅ 关键词高亮（只在非 search 情况下）
      if (isKeyword && !isSearchHighlight) {
        styles.push("background: #e6e1db");
        styles.push(
          "padding: calc(5 / 1080 * 100vh) calc(4 / 1080 * 100vw)"
        );
      }

      const tn = $createTextNode(part);
      if (styles.length) tn.setStyle(styles.join("; "));
      p.append(tn);
    });
  };

  const findAllMatchesInText = (text: string, needles: string[]) => {
    const matches: { start: number; end: number }[] = [];

    for (const s of needles) {
      if (!s) continue;
      let idx = 0;
      while (true) {
        const pos = text.indexOf(s, idx);
        if (pos === -1) break;
        matches.push({ start: pos, end: pos + s.length });
        idx = pos + s.length;
      }
    }

    matches.sort((a, b) => a.start - b.start || b.end - a.end);

    const merged: { start: number; end: number }[] = [];
    for (const m of matches) {
      const last = merged[merged.length - 1];
      if (!last || m.start >= last.end) {
        merged.push(m);
      }
    }
    return merged;
  };

  paragraphMap.forEach(({ para, startOffset, text }) => {
    para.clear();

    if (text === "") {
      para.append($createTextNode(""));
      return;
    }

    // 全局 search match -> 段落内 match（保持不变）
    const localSearchMatches: Array<{ start: number; end: number }> = [];
    for (const match of globalSearchMatches) {
      if (match.start < startOffset + text.length && match.end > startOffset) {
        const localStart = Math.max(0, match.start - startOffset);
        const localEnd = Math.min(text.length, match.end - startOffset);
        localSearchMatches.push({ start: localStart, end: localEnd });
      }
    }

    const ranges = ks.length ? findAllMatchesInText(text, ks) : [];

    if (ranges.length === 0 && localSearchMatches.length === 0) {
      appendWithStyles(para, text, false, false);
      return;
    }

    let cursor = 0;

    for (const range of ranges) {
      const before = text.slice(cursor, range.start);
      if (before) {
        renderTextWithSearchHighlight(
          para,
          before,
          cursor,
          localSearchMatches,
          false
        );
      }

      const target = text.slice(range.start, range.end);
      if (target) {
        renderTextWithSearchHighlight(
          para,
          target,
          range.start,
          localSearchMatches,
          true
        );
      }

      cursor = range.end;
    }

    const tail = text.slice(cursor);
    if (tail) {
      renderTextWithSearchHighlight(para, tail, cursor, localSearchMatches, false);
    }

    if (para.getChildren().length === 0) {
      para.append($createTextNode(""));
    }
  });

  function renderTextWithSearchHighlight(
    para: any,
    text: string,
    textStartOffset: number,
    searchMatches: Array<{ start: number; end: number }>,
    isUnderline: boolean = false
  ) {
    if (!text) return;

    if (!searchMatches.length) {
      appendWithStyles(para, text, isUnderline, false);
      return;
    }

    let cursor = 0;

    for (const match of searchMatches) {
      if (match.start < textStartOffset + text.length && match.end > textStartOffset) {
        const localStart = Math.max(0, match.start - textStartOffset);
        const localEnd = Math.min(text.length, match.end - textStartOffset);

        if (localStart > cursor) {
          const before = text.slice(cursor, localStart);
          appendWithStyles(para, before, isUnderline, false);
        }

        const matchedPart = text.slice(localStart, localEnd);
        appendWithStyles(para, matchedPart, isUnderline, true);

        cursor = localEnd;
      }
    }

    if (cursor < text.length) {
      const tail = text.slice(cursor);
      appendWithStyles(para, tail, isUnderline, false);
    }
  }
}

/**
 * ✅ cond3 专用入口（wrapper，不改逻辑）
 */
export function applyAnnotationsToRootCond3(args: {
  keyWords?: string[];
  keySentences?: string[];
  searchWords?: string[];
  searchEnabled?: boolean;
  wholeWordOnly?: boolean;
}) {
  return applyAnnotationsToRoot(
    args.keyWords ?? [],
    args.keySentences ?? [],
    args.searchWords ?? [],
    !!args.searchEnabled,
    !!args.wholeWordOnly
  );
}

export default function AnnotationCond3OnBlurPlugin({
  keyWords = [],
  keySentences = [],
  searchWords = [],
  searchEnabled = false,
  wholeWordOnly = false,
  enabled = true,
}: {
  keyWords?: string[];
  keySentences?: string[];
  searchWords?: string[];
  searchEnabled?: boolean;
  wholeWordOnly?: boolean;
  enabled?: boolean;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!enabled) return;

    return editor.registerCommand(
      BLUR_COMMAND,
      () => {
        editor.update(() => {
          applyAnnotationsToRoot(
            keyWords,
            keySentences,
            searchWords,
            searchEnabled,
            wholeWordOnly
          );
        });
        return false;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [
    editor,
    enabled,
    keyWords,
    keySentences,
    searchWords,
    searchEnabled,
    wholeWordOnly,
  ]);

  return null;
}