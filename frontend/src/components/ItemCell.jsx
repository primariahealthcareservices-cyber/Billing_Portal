// frontend/src/components/ItemCell.jsx
import React, { useEffect, useRef, useState } from "react";

export const itemCellStyle = {
  maxWidth: 220,
  whiteSpace: "normal",
  wordBreak: "break-word",
};

/**
 * Popover cell — shows a short label; clicking reveals the full content.
 *
 * Two usage modes:
 *
 * 1) Items mode — pass `items` as an array of { item_name, quantity }:
 *      <ItemCell items={items} />
 *    The collapsed label is just "3 items" (or "3 item" for 1).
 *    The popover renders each item as a row: "r1sdfsdf (x1)".
 *
 * 2) Text mode — pass `text` as a string:
 *      <ItemCell text={entry.remarks} previewLabel="View" />
 *    The collapsed label is `previewLabel` (default "View").
 *    The popover renders the full text.
 */
export default function ItemCell({
  items,
  text,
  previewLabel,
  style,
}) {
  const isItemsMode = Array.isArray(items);

  // -------- Build full + preview content depending on mode --------
  let full = "";
  let preview = "";
  let isTruncated = false;
  let renderFull = null;

  if (isItemsMode) {
    const list = items.filter(Boolean);
    if (list.length === 0) {
      full = "";
      preview = "";
    } else {
      // Full text (for title / accessibility) and popover rows
      const rows = list.map((item) => {
        const qty = Number(item?.quantity || 0);
        return `${item?.item_name || "Item"} (x${qty})`;
      });
      full = rows.join("\n");
      preview = `${list.length} item${list.length > 1 ? "s" : ""}`;
      // Only need the popover if there's at least 1 item (always show on click)
      isTruncated = true;
      renderFull = (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {rows.map((r, i) => (
            <div key={i}>{r}</div>
          ))}
        </div>
      );
    }
  } else {
    const str = (text ?? "").toString().trim();
    full = str;
    if (!str) {
      preview = "";
    } else {
      preview = previewLabel || "View";
      isTruncated = true; // always allow expanding remarks
      renderFull = <div style={{ whiteSpace: "pre-wrap" }}>{str}</div>;
    }
  }

  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!full) return <span style={style}>—</span>;

  return (
    <span
      ref={wrapRef}
      style={{
        position: "relative",
        display: "inline-block",
        maxWidth: "100%",
        ...style,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={open ? "Hide" : full}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          margin: 0,
          color: "#2f5dd4",
          fontWeight: 500,
          cursor: "pointer",
          textAlign: "left",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "100%",
          font: "inherit",
        }}
      >
        {preview}
      </button>

      {open && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 30,
            minWidth: 180,
            maxWidth: 340,
            padding: "8px 10px",
            borderRadius: 8,
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            boxShadow: "0 8px 24px rgba(16,24,40,0.12)",
            color: "#111827",
            fontSize: 12.5,
            lineHeight: 1.5,
            whiteSpace: "normal",
            wordBreak: "break-word",
          }}
        >
          {renderFull}
        </span>
      )}
    </span>
  );
}