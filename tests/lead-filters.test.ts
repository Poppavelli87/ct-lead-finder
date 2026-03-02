import { buildLeadWhere } from "@/lib/lead-filters";

function andClauses(where: any): any[] {
  return Array.isArray(where?.AND) ? where.AND : [];
}

describe("lead-filters", () => {
  it("maps source filter into Prisma where shape", () => {
    const where = buildLeadWhere({
      source: "CT_REGISTRY",
      qualified: "all",
    });

    expect(andClauses(where)).toContainEqual({ source: "CT_REGISTRY" });
  });

  it("maps pipelineStatus filter into Prisma where shape", () => {
    const where = buildLeadWhere({
      pipelineStatus: "MATCHED",
      qualified: "all",
    });

    expect(andClauses(where)).toContainEqual({
      AND: [{ externalId: { not: null } }, { phone: null }, { phoneStatus: null }],
    });
  });

  it("maps qualified filter yes/no correctly", () => {
    const yesWhere = buildLeadWhere({
      qualified: "yes",
    });
    expect(andClauses(yesWhere)).toContainEqual({ qualified: true });

    const noWhere = buildLeadWhere({
      qualified: "no",
    });
    expect(andClauses(noWhere)).toContainEqual({ qualified: false });
  });

  it("maps date range into createdAt gte/lte", () => {
    const where = buildLeadWhere({
      qualified: "all",
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
    });

    const clauses = andClauses(where);
    const createdAtClause = clauses.find((clause) => "createdAt" in clause);
    expect(createdAtClause).toBeDefined();
    expect(createdAtClause).toMatchObject({
      createdAt: {
        gte: new Date("2026-01-01"),
        lte: new Date("2026-01-31"),
      },
    });
  });
});
