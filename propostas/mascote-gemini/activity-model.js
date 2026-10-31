// Proposal-only event reducer. Contract: https://antigravity.google/docs/hooks
// Keeps tool identity and step indexes; never retains arguments, results or paths.
const TOOL_KINDS = {
  search_web: 'web', read_url_content: 'page', view_file: 'reading',
  list_dir: 'files', find_by_name: 'files', grep_search: 'files',
  write_to_file: 'writing', replace_file_content: 'writing', multi_replace_file_content: 'writing',
  run_command: 'terminal', manage_task: 'terminal',
  invoke_subagent: 'agents', ask_question: 'question', ask_permission: 'question',
  generate_image: 'image'
};
function classifyTool(name) {
  if (typeof name !== 'string') return 'external';
  return Object.hasOwn(TOOL_KINDS, name) ? TOOL_KINDS[name] : 'external';
}

function createActivityModel(conversationId) {
  if (typeof conversationId !== 'string' || !conversationId) throw new TypeError('A session is required');
  const active = new Map(), completed = new Set();
  let kind = 'idle', lastError = false, lastEvent = 'none', stopped = false;
  function snapshot() {
    const running = [...active.values()];
    return { kind: running.at(-1)?.kind || kind, activeCount: active.size, lastEvent, hasError: lastError };
  }
  function receive(event, payload) {
    if (!payload || typeof payload !== 'object' || payload.conversationId !== conversationId) return snapshot();
    if (!['SessionStart', 'PreToolUse', 'PostToolUse', 'PreInvocation', 'PostInvocation', 'Stop'].includes(event)) return snapshot();
    if (stopped && event !== 'PreInvocation') return snapshot();
    if (event === 'PreToolUse' || event === 'PostToolUse') {
      const name = payload.toolCall?.name;
      if (typeof name !== 'string' || !name || name.length > 128 || !Number.isInteger(payload.stepIdx) || payload.stepIdx < 0) return snapshot();
      const key = `${payload.stepIdx}:${name}`;
      if (completed.has(key)) return snapshot();
      if (event === 'PreToolUse') {
        if (!active.has(key)) active.set(key, { kind: classifyTool(name) });
      } else {
        // A completion received before its start must not resurrect that tool later.
        active.delete(key);
        completed.add(key);
        lastError ||= typeof payload.error === 'string' && payload.error.trim().length > 0;
        kind = lastError ? 'error' : 'waiting';
      }
    } else if (event === 'SessionStart') {
      // Replayed starts are idempotent and cannot clear an in-flight call.
      if (lastEvent !== 'none') return snapshot();
      kind = 'idle';
    } else if (event === 'PreInvocation') {
      stopped = false;
      if (!active.size) { kind = 'model'; lastError = false; }
    } else if (event === 'PostInvocation') {
      if (!active.size) kind = lastError ? 'error' : 'waiting';
    } else if (event === 'Stop') {
      active.clear(); stopped = true; kind = lastError ? 'error' : 'ended';
    }
    lastEvent = event;
    return snapshot();
  }
  return { receive, snapshot };
}
if (typeof module !== 'undefined') module.exports = { classifyTool, createActivityModel };
