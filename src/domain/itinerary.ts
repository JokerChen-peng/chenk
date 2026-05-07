/**
 * Timeline / itinerary 相关纯逻辑：节点合法性、重叠检测、可行性断言。
 * 完全无副作用，可以在工具、CLI、UI、测试里复用。
 */

export type TimelineNodeCore = {
  node_id: string;
  label: string;
  start_time_iso: string;
  end_time_iso: string;
};

export function assertValidNodeRange(node: TimelineNodeCore): void {
  const start = new Date(node.start_time_iso).getTime();
  const end = new Date(node.end_time_iso).getTime();
  if (start >= end) {
    throw new Error(
      JSON.stringify({
        code: "INVALID_ARGUMENT",
        message: "timeline node start_time_iso must be before end_time_iso",
        node_id: node.node_id,
      }),
    );
  }
}

export function findOverlapPairs(
  timeline_nodes: TimelineNodeCore[],
): Array<[string, string]> {
  const ordered = [...timeline_nodes].sort(
    (a, b) =>
      new Date(a.start_time_iso).getTime() -
      new Date(b.start_time_iso).getTime(),
  );
  const overlap_pairs: Array<[string, string]> = [];
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const curr = ordered[i];
    if (!prev || !curr) continue;
    const prevEnd = new Date(prev.end_time_iso).getTime();
    const currStart = new Date(curr.start_time_iso).getTime();
    if (currStart < prevEnd) {
      overlap_pairs.push([prev.node_id, curr.node_id]);
    }
  }
  return overlap_pairs;
}

export function assertTimelineFeasible(timeline_nodes: TimelineNodeCore[]): void {
  timeline_nodes.forEach(assertValidNodeRange);
  const overlap_pairs = findOverlapPairs(timeline_nodes);
  if (overlap_pairs.length > 0) {
    const structuredLog = {
      code: "RESOURCE_EXHAUSTED",
      message: "Timeline nodes overlap and exceed feasible scheduling capacity.",
      overlap_pairs,
    };
    console.error(JSON.stringify(structuredLog));
    throw new Error(JSON.stringify(structuredLog));
  }
}
