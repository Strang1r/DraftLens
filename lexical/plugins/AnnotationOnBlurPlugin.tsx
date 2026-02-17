// src/components/AnnotationOnBlurPlugin.tsx
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

// - keyword：背景高亮
// - key sentence：只下划线“命中的句子片段”，不再整段
// - 支持同一段多个 key sentences（按出现顺序逐段切分）
export function applyAnnotationsToRoot(keyWords: string[] = [], keySentences: string[] = [], searchWords: string[] = [],             // ✅ 新增
  searchEnabled: boolean = false, wholeWordOnly: boolean = false) {
  const root = $getRoot();
  const children = root.getChildren();

  // 1) 收集所有段落节点并构建完整文本
  const paragraphs: any[] = [];
  const paragraphMap: Array<{ para: any; startOffset: number; text: string }> = [];
  let fullText = "";

  children.forEach((node) => {
    if (!$isParagraphNode(node)) return;
    const text = node.getTextContent() ?? "";
    paragraphs.push(node);
    paragraphMap.push({
      para: node,
      startOffset: fullText.length,
      text,
    });
    fullText += text;
  });

  const kws = (keyWords || []).map((s) => s.trim()).filter(Boolean);
  const ks = (keySentences || []).map((s) => s.trim()).filter(Boolean);

  // 关键词正则：大小写不敏感
  const kwRegex =
    kws.length > 0 ? new RegExp(`(${kws.map(escapeRegExp).join("|")})`, "gi") : null;

  const sws = (searchWords || []).map((s) => s.trim()).filter(Boolean);
  // ✅ 如果 wholeWordOnly 为 true，对于单词（无空格）使用 \b 词边界
  // 对于多词句子（含空格），直接使用完全匹配
  const searchRegex = searchEnabled && sws.length > 0
    ? new RegExp(
      wholeWordOnly
        ? `(${sws.map(s => s.includes(' ')
          ? escapeRegExp(s)  // 多词句子：直接转义，不用词边界
          : `\\b${escapeRegExp(s)}\\b`  // 单词：使用词边界
        ).join("|")})`
        : `(${sws.map(escapeRegExp).join("|")})`,
      "gi"
    )
    : null;

  // 2) 在全文本上进行全局搜索（支持跨行）
  const globalSearchMatches: Array<{ start: number; end: number }> = [];
  if (searchRegex && fullText) {
    let match;
    searchRegex.lastIndex = 0;
    while ((match = searchRegex.exec(fullText)) !== null) {
      globalSearchMatches.push({ start: match.index, end: match.index + match[0].length });
    }
  }

  // 把一段 segment 按关键词 split，并附加到段落里
  // underline=true 表示这一段属于关键句范围，需要下划线
  // isSearchHighlight=true 表示这一段属于搜索匹配范围（优先级高于关键词）
  const appendWithStyles = (
    p: any,
    segment: string,
    underline: boolean,
    isSearchHighlight: boolean = false
  ) => {
    if (segment == null || segment === "") return;

    const splitter = kwRegex;
    const parts = splitter ? segment.split(splitter) : [segment];

    parts.forEach((part) => {
      if (part === "") return;

      const tn = $createTextNode(part);

      const isKeyword = kwRegex ? kwRegex.test(part) : false;
      if (kwRegex) kwRegex.lastIndex = 0;

      const styles: string[] = [];

      // 搜索高亮优先级高于关键词高亮
      if (isSearchHighlight) {
        styles.push("background: #e6e1db");
        styles.push("padding: calc(5 / 1080 * 100vh) calc(4 / 1080 * 100vw)");
      }

      if (underline) {
        styles.push("border-bottom: calc(1 / 1080 * 100vh) solid #222");
        styles.push("padding-bottom: calc(5 / 1080 * 100vh)"); // 让线离文字更舒服
      }

      if (isKeyword && !isSearchHighlight) {
        styles.push("background: #e6e1db");
        styles.push("padding: calc(5 / 1080 * 100vh) calc(4 / 1080 * 100vw)");
      }

      if (styles.length) tn.setStyle(styles.join("; "));
      p.append(tn);
    });
  };

  // 为了让“多个关键句”更稳定：按段落里出现顺序逐个处理
  const findAllMatchesInText = (text: string, needles: string[]) => {
    const matches: { start: number; end: number; s: string }[] = [];

    for (const s of needles) {
      if (!s) continue;
      let idx = 0;
      while (true) {
        const pos = text.indexOf(s, idx);
        if (pos === -1) break;
        matches.push({ start: pos, end: pos + s.length, s });
        idx = pos + s.length;
      }
    }

    // 排序：先按 start，再按长的优先（避免短句覆盖长句）
    matches.sort((a, b) => a.start - b.start || b.end - a.end);

    // 去重/去重叠：保留不重叠的区间
    const merged: { start: number; end: number }[] = [];
    for (const m of matches) {
      const last = merged[merged.length - 1];
      if (!last) {
        merged.push({ start: m.start, end: m.end });
        continue;
      }
      if (m.start >= last.end) {
        merged.push({ start: m.start, end: m.end });
      } else {
        // 重叠就跳过
        continue;
      }
    }
    return merged;
  };

  // 3) 处理每个段落
  paragraphMap.forEach(({ para, startOffset, text }) => {
    para.clear();

    // 空段落保留一个空 text node
    if (text === "") {
      para.append($createTextNode(""));
      return;
    }

    // 找到与当前段落相关的搜索匹配项（全局坐标转本地坐标）
    const localSearchMatches: Array<{ start: number; end: number }> = [];
    for (const match of globalSearchMatches) {
      // 检查全局匹配是否与当前段落有交集
      if (match.start < startOffset + text.length && match.end > startOffset) {
        // 有交集，转换为本地坐标
        const localStart = Math.max(0, match.start - startOffset);
        const localEnd = Math.min(text.length, match.end - startOffset);
        localSearchMatches.push({ start: localStart, end: localEnd });
      }
    }

    // 找到所有关键句在段落内的区间（可为 0 个）
    const ranges = ks.length ? findAllMatchesInText(text, ks) : [];

    // 按关键句区间切开段落并渲染
    if (ranges.length === 0 && localSearchMatches.length === 0) {
      // 没关键句也没搜索命中：只处理关键词
      appendWithStyles(para, text, false, false);
      return;
    }

    // 合并所有需要渲染的区间（关键句下划线 + 搜索高亮）
    let cursor = 0;

    // 处理关键句范围
    for (const range of ranges) {
      const before = text.slice(cursor, range.start);
      // 按搜索匹配渲染 before 部分
      if (before) {
        renderTextWithSearchHighlight(para, before, cursor, localSearchMatches);
      }

      // 关键句部分+搜索高亮
      const target = text.slice(range.start, range.end);
      if (target) {
        renderTextWithSearchHighlight(para, target, range.start, localSearchMatches, true);
      }

      cursor = range.end;
    }

    // 处理尾部（关键句后的剩余文本）
    const tail = text.slice(cursor);
    if (tail) {
      renderTextWithSearchHighlight(para, tail, cursor, localSearchMatches);
    }

    if (para.getChildren().length === 0) {
      para.append($createTextNode(""));
    }
  });

  // 辅助函数：在指定范围内渲染文本，考虑搜索高亮
  function renderTextWithSearchHighlight(
    para: any,
    text: string,
    textStartOffset: number,
    searchMatches: Array<{ start: number; end: number }>,
    isUnderline: boolean = false
  ) {
    if (!searchMatches.length) {
      // 没有搜索匹配，直接渲染整个文本
      appendWithStyles(para, text, isUnderline, false);
      return;
    }

    let cursor = 0;
    for (const match of searchMatches) {
      // 检查搜索匹配是否与当前文本有交集
      if (match.start < textStartOffset + text.length && match.end > textStartOffset) {
        // 有交集
        const localMatchStart = Math.max(0, match.start - textStartOffset);
        const localMatchEnd = Math.min(text.length, match.end - textStartOffset);

        // 渲染匹配前的部分（无高亮）
        if (localMatchStart > cursor) {
          const before = text.slice(cursor, localMatchStart);
          appendWithStyles(para, before, isUnderline, false);
        }

        // 渲染匹配部分（有高亮）
        const matchedPart = text.slice(localMatchStart, localMatchEnd);
        appendWithStyles(para, matchedPart, isUnderline, true);

        cursor = localMatchEnd;
      }
    }

    // 渲染尾部（没有任何匹配）
    if (cursor < text.length) {
      const tail = text.slice(cursor);
      appendWithStyles(para, tail, isUnderline, false);
    }
  }
}

export default function AnnotationOnBlurPlugin({
  keyWords = [],
  keySentences = [],
  enabled = true,
}: {
  keyWords?: string[];
  keySentences?: string[];
  enabled?: boolean;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!enabled) return;

    return editor.registerCommand(
      BLUR_COMMAND,
      () => {
        editor.update(() => {
          applyAnnotationsToRoot(keyWords, keySentences);
        });
        return false;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor, enabled, keyWords, keySentences]);

  return null;
}
