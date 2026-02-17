// src/components/plugins/AnnotationCond5Plugin.tsx
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
 * Cond5 annotation：
 * - 只做 keyword / keySentence（不含 search）
 * - 不依赖 AnnoRangeNode
 */
export function applyAnnotationsToRootCond5(
  keyWords: string[] = [],
  keySentences: string[] = []
) {
  const root = $getRoot();
  const children = root.getChildren();

  const paragraphMap: Array<{ para: any; text: string }> = [];
  children.forEach((node) => {
    if (!$isParagraphNode(node)) return;
    paragraphMap.push({ para: node, text: node.getTextContent() ?? "" });
  });

  const kws = (keyWords || []).map((s) => s.trim()).filter(Boolean);
  const ks = (keySentences || []).map((s) => s.trim()).filter(Boolean);

  const kwRegex =
    kws.length > 0
      ? new RegExp(`(${kws.map(escapeRegExp).join("|")})`, "gi")
      : null;

  const appendWithStyles = (p: any, segment: string, underline: boolean) => {
    if (segment == null || segment === "") return;

    const parts = kwRegex ? segment.split(kwRegex) : [segment];

    parts.forEach((part) => {
      if (part === "") return;

      const isKeyword = kwRegex ? kwRegex.test(part) : false;
      if (kwRegex) kwRegex.lastIndex = 0;

      const styles: string[] = [];

      // key sentence underline（如果你 cond5 不需要，可直接删掉这一段）
      if (underline) {
        styles.push("border-bottom: calc(1 / 1080 * 100vh) solid #222");
        styles.push("padding-bottom: calc(5 / 1080 * 100vh)");
      }

      // keyword highlight
      if (isKeyword) {
        styles.push("background: #e6e1db");
        styles.push("padding: calc(5 / 1080 * 100vh) calc(4 / 1080 * 100vw)");
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
      if (!last || m.start >= last.end) merged.push(m);
    }
    return merged;
  };

  paragraphMap.forEach(({ para, text }) => {
    para.clear();

    if (text === "") {
      para.append($createTextNode(""));
      return;
    }

    const ranges = ks.length ? findAllMatchesInText(text, ks) : [];
    if (ranges.length === 0) {
      appendWithStyles(para, text, false);
      return;
    }

    let cursor = 0;
    for (const range of ranges) {
      const before = text.slice(cursor, range.start);
      if (before) appendWithStyles(para, before, false);

      const target = text.slice(range.start, range.end);
      if (target) appendWithStyles(para, target, true);

      cursor = range.end;
    }

    const tail = text.slice(cursor);
    if (tail) appendWithStyles(para, tail, false);

    if (para.getChildren().length === 0) {
      para.append($createTextNode(""));
    }
  });
}

export default function AnnotationCond5OnBlurPlugin({
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
          applyAnnotationsToRootCond5(keyWords, keySentences);
        });
        return false;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor, enabled, keyWords, keySentences]);

  return null;
}
