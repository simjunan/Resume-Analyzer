import DiffMatchPatch from 'diff-match-patch';
import React from 'react';

const dmp = new DiffMatchPatch();

export function getDiffNodes(beforeText: string, afterText: string): React.ReactNode[] {
  const diffs = dmp.diff_main(beforeText || "", afterText || "");
  dmp.diff_cleanupSemantic(diffs);
  
  return diffs.map(([op, text], index) => {
    if (op === 1) {
      return React.createElement('ins', { key: index, className: 'diff-insert no-underline' }, text);
    }
    if (op === -1) {
      return React.createElement('del', { key: index, className: 'diff-delete' }, text);
    }
    return React.createElement('span', { key: index }, text);
  });
}
