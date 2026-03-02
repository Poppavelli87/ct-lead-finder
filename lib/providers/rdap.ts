import { getProviderBySlug, ProviderRequestError, providerRequest } from "./request";
import { PROVIDER_SLUGS } from "./constants";

export type RdapHint = {
  registrar: string | null;
  createdDate: string | null;
  raw: unknown;
};

export async function lookupRdapDomain(domain: string): Promise<RdapHint | null> {
  const provider = await getProviderBySlug(PROVIDER_SLUGS.RDAP);
  if (!provider.enabled) {
    throw new ProviderRequestError({
      code: "PROVIDER_NOT_CONFIGURED",
      provider: PROVIDER_SLUGS.RDAP,
      statusCode: 500,
      message: "RDAP provider is disabled in API Hub.",
    });
  }

  const response = await providerRequest<Record<string, unknown>>({
    slug: PROVIDER_SLUGS.RDAP,
    endpointKey: "domain_lookup",
    pathParams: { domain },
  });

  const entities = Array.isArray(response.data?.entities)
    ? (response.data.entities as Array<Record<string, unknown>>)
    : [];

  const registrarEntity = entities.find((entity) => {
    const roles = Array.isArray(entity.roles) ? (entity.roles as string[]) : [];
    return roles.includes("registrar");
  });

  const events = Array.isArray(response.data?.events)
    ? (response.data.events as Array<Record<string, unknown>>)
    : [];

  const createdEvent = events.find((event) => event.eventAction === "registration");

  const vcard = Array.isArray(registrarEntity?.vcardArray)
    ? (registrarEntity?.vcardArray as Array<unknown>)
    : [];

  let registrar: string | null = null;
  if (Array.isArray(vcard[1])) {
    const fields = vcard[1] as Array<unknown>;
    for (const field of fields) {
      if (Array.isArray(field) && field[0] === "fn") {
        registrar = String(field[3] ?? "").trim() || null;
      }
    }
  }

  return {
    registrar,
    createdDate: typeof createdEvent?.eventDate === "string" ? createdEvent.eventDate : null,
    raw: response.data,
  };
}

