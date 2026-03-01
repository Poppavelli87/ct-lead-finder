export const CT_COUNTY_ADJACENCY: Record<string, string[]> = {
  Fairfield: ["Litchfield", "New Haven"],
  Hartford: ["Litchfield", "Middlesex", "New Haven", "New London", "Tolland", "Windham"],
  Litchfield: ["Fairfield", "Hartford", "New Haven"],
  Middlesex: ["Hartford", "New Haven", "New London"],
  "New Haven": ["Fairfield", "Hartford", "Litchfield", "Middlesex"],
  "New London": ["Hartford", "Middlesex", "Tolland", "Windham"],
  Tolland: ["Hartford", "New London", "Windham"],
  Windham: ["Hartford", "New London", "Tolland"],
};

export const CT_COUNTIES = Object.keys(CT_COUNTY_ADJACENCY);

export function progressiveCountyOrder(seedCounty: string): string[] {
  const normalized = seedCounty.trim();
  if (!CT_COUNTY_ADJACENCY[normalized]) {
    return CT_COUNTIES;
  }

  const seen = new Set<string>([normalized]);
  const queue = [normalized];
  const order: string[] = [normalized];

  while (queue.length) {
    const current = queue.shift()!;
    for (const next of CT_COUNTY_ADJACENCY[current] ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        order.push(next);
        queue.push(next);
      }
    }
  }

  for (const county of CT_COUNTIES) {
    if (!seen.has(county)) {
      order.push(county);
    }
  }

  return order;
}

