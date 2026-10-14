// frontend/src/components/RemarkCell.jsx
import React, { useState } from "react";

/* Shows the first `limit` words of a remark followed by a clickable "...".
   Clicking "..." reveals the complete text; "Show less" collapses it again. */

export const REMARK_WORD_LIMIT = 20;

// Use on the <td>/<th> that holds a remark so the column doesn't get squeezed
// into a one-word-per-line strip.
export const remarkCellStyle = {
  whiteSpace: "normal",
  wordBreak: "break-word",
  minWidth: 240,
  maxWidth: 380,
};

const linkStyle = {
  background: "none",
  border: "none",
  padding: 0,
  margin: 0,
  color: "#2f5dd4",
  fontWeight: 700,
  cursor: "pointer",
  font: "inherit",
};

export default function RemarkCell({ text, limit = REMARK_WORD_LIMIT }) {
  const [expanded, setExpanded] = useState(false);
  const str = (text ?? "").toString().trim();

  if (!str) return <>—</>;

  const words = str.split(/\s+/);
  if (words.length <= limit) return <>{str}</>;

  if (expanded) {
    return (
      <span>
        {str}{" "}
        <button
          type="button"
          style={{ ...linkStyle, fontWeight: 600, fontSize: 12 }}
          onClick={() => setExpanded(false)}
          title="Show less"
        >
          Show less
        </button>
      </span>
    );
  }

  return (
    <span>
      {words.slice(0, limit).join(" ")}
      <button
        type="button"
        style={linkStyle}
        onClick={() => setExpanded(true)}
        title="Click to read the full remark"
      >
        {" "}...
      </button>
    </span>
  );
}