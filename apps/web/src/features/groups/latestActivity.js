// The few most recent items of a group's activity (expenses and payments together) for the group screen.

/**
 * Newest first, whatever order the API sent them in.
 * @param {{ createdAt: string }[]} items
 * @param {number} limit
 */
export function latestActivity(items, limit) {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}
