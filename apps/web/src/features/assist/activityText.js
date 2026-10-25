/**
 * The line shown for an agent activity item or approval. Sample data carries a `code` (and a `bill`) so the sentence
 * follows the language; anything from a real API keeps its own `description`.
 * @param {(key: string, params?: Record<string, unknown>) => string} t
 * @param {{ code?: string, bill?: string, description: string, to?: string }} item
 * @param {(memberId: string) => string} nameOf
 */
export function activityText(t, item, nameOf) {
  if (!item.code) return item.description;
  return t(`agent.act.${item.code}`, {
    item: item.bill ? t(`bill.${item.bill}`).toLowerCase() : '',
    group: 'Casa Alfama',
    name: item.to ? nameOf(item.to) : '',
  });
}
