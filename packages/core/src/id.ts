/**
 * Branded identifiers.
 *
 * Every id in the system is a uuid string at runtime, which means the compiler
 * will happily let you pass an organizationId where a userId belongs. Branding
 * closes that hole at zero runtime cost.
 */
declare const brand: unique symbol;

export type Branded<T, TBrand extends string> = T & { readonly [brand]: TBrand };

export type Uuid<TBrand extends string> = Branded<string, TBrand>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Casts a validated string into a branded id. Prefer parsing via a schema. */
export function asId<TBrand extends string>(value: string): Uuid<TBrand> {
  return value as Uuid<TBrand>;
}
